// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {SolvencyRegistry} from "./SolvencyRegistry.sol";
import {VaultProofConstants} from "./VaultProofConstants.sol";

/// @notice Minimal surface of Flare's TeeExtensionRegistry that the sender
/// needs for FCC routing. Transcribed from
/// extension/contracts/interfaces/ITeeExtensionRegistry.sol.
interface ITeeExtensionRegistry {
    struct TeeInstructionParams {
        bytes32 opType;
        bytes32 opCommand;
        bytes message;
        address[] cosigners;
        uint64 cosignersThreshold;
        address claimBackAddress;
    }

    function sendInstructions(
        address[] calldata _teeIds,
        TeeInstructionParams calldata _instructionParams
    ) external payable returns (bytes32 _instructionId);

    function nextPublicExtensionId() external view returns (uint256);

    function getTeeExtensionInstructionsSender(uint256 _extensionId) external view returns (address);
}

/// @notice Minimal surface of Flare's TeeMachineRegistry. Transcribed from
/// extension/contracts/interfaces/ITeeMachineRegistry.sol.
interface ITeeMachineRegistry {
    function getRandomTeeIds(uint256 _extensionId, uint256 _count)
        external
        view
        returns (address[] memory);
}

/// @notice VaultProof's on-chain entry point, and the only address the
/// SolvencyRegistry accepts attestations from.
///
/// Two jobs (spec §5, steps 5–7):
///  1. `submitRequest` anchors keccak256(sealedBlob) on-chain BEFORE the
///     ciphertext is delivered anywhere. The enclave refuses to process a blob
///     whose hash does not appear in a confirmed RequestSubmitted event, so a
///     request cannot be replayed against a different wallet.
///  2. `deliverAttestation` is the write path back: the TEE executor (the
///     enclave's registered signing address) lands the tier in the
///     SolvencyRegistry. No balance, account id or API key ever appears here.
///
/// FCC routing (`sendSolvencyInstruction` / `setExtensionId`) activates once
/// the extension is registered on Flare's TeeExtensionRegistry; until then the
/// anchor + deliver path is fully functional on its own.
contract VaultProofInstructionSender {
    bytes32 public constant OP_TYPE = VaultProofConstants.OP_TYPE;
    bytes32 public constant OP_SOLVENCY = VaultProofConstants.OP_SOLVENCY;

    /// @notice The registry reserves IDs below this for system extensions.
    uint256 private constant FIRST_PUBLIC_EXTENSION_ID = 0x10000;

    address public owner;
    /// @notice The enclave's signing address; the only caller of deliverAttestation.
    address public teeExecutor;
    /// @notice Set once after SolvencyRegistry is deployed (it needs this
    /// contract's address in its constructor, so the wiring is two-step).
    SolvencyRegistry public registry;
    /// @notice Flare's TeeExtensionRegistry; zero until FCC registration.
    ITeeExtensionRegistry public teeExtensionRegistry;
    /// @notice Flare's TeeMachineRegistry, used to pick a TEE to dispatch to.
    ITeeMachineRegistry public teeMachineRegistry;

    uint256 private _extensionId;

    event RequestSubmitted(address indexed wallet, bytes32 indexed requestHash);
    event AttestationDelivered(address indexed wallet, uint8 tier);
    event ExecutorChanged(address indexed previousExecutor, address indexed newExecutor);

    error NotOwner();
    error NotExecutor();
    error RegistryAlreadySet();
    error RegistryNotSet();

    constructor() {
        owner = msg.sender;
        teeExecutor = msg.sender; // rotated to the enclave signer on go-live
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    /// @notice Anchor the hash of a sealed request blob AND dispatch the
    /// ATTEST_SOLVENCY instruction that asks a TEE to act on it.
    ///
    /// The anchor must be emitted before the instruction is dispatched: the
    /// enclave refuses a blob whose hash it has not seen anchored, so ordering
    /// these the other way round would race the enclave against its own replay
    /// defence.
    ///
    /// An earlier version of this function emitted the event and stopped. That
    /// looked complete — the hash was anchored, the ciphertext was delivered,
    /// gas was spent — but no instruction was ever created, so the enclave was
    /// never asked to do anything and the pipeline stalled with nothing to
    /// diagnose. The dispatch below is what was missing.
    ///
    /// `msg.value` forwards the FCC instruction fee. `claimBackAddress` is the
    /// caller, so any unspent fee returns to the user rather than to us.
    function submitRequest(bytes32 requestHash) external payable {
        emit RequestSubmitted(msg.sender, requestHash);

        // Routing is optional so the anchor path still works before FCC
        // registration — deployment order requires this contract to exist
        // before the extension that names it can be registered.
        if (address(teeExtensionRegistry) == address(0) || address(teeMachineRegistry) == address(0)) {
            return;
        }

        address[] memory teeIds = teeMachineRegistry.getRandomTeeIds(_requireExtensionId(), 1);

        ITeeExtensionRegistry.TeeInstructionParams memory params = ITeeExtensionRegistry
            .TeeInstructionParams({
            opType: OP_TYPE,
            opCommand: OP_SOLVENCY,
            // Matches types.AttestSolvencyRequest in the Go enclave. The nonce
            // is the request hash: it is already unique per request, and the
            // enclave only echoes it back into the attestation.
            message: abi.encodePacked(
                '{"wallet":"',
                _toHexString(msg.sender),
                '","requestHash":"',
                _toHexString32(requestHash),
                '","nonce":"',
                _toHexString32(requestHash),
                '"}'
            ),
            cosigners: new address[](0),
            cosignersThreshold: 0,
            claimBackAddress: msg.sender
        });

        teeExtensionRegistry.sendInstructions{value: msg.value}(teeIds, params);
    }

    /// @notice TEE write path into the SolvencyRegistry.
    function deliverAttestation(
        address wallet,
        uint8 tier,
        uint64 validForSeconds,
        bytes32 nullifier,
        bytes32 nonce,
        bytes32 measurement
    ) external {
        if (msg.sender != teeExecutor) revert NotExecutor();
        if (address(registry) == address(0)) revert RegistryNotSet();
        registry.submitAttestation(wallet, tier, validForSeconds, nullifier, nonce, measurement);
        emit AttestationDelivered(wallet, tier);
    }

    // ---- wiring, called once at deploy / go-live ----

    function setRegistry(SolvencyRegistry _registry) external onlyOwner {
        if (address(registry) != address(0)) revert RegistryAlreadySet();
        registry = _registry;
    }

    function setTeeExecutor(address _executor) external onlyOwner {
        emit ExecutorChanged(teeExecutor, _executor);
        teeExecutor = _executor;
    }

    function setTeeExtensionRegistry(ITeeExtensionRegistry _teeExtensionRegistry) external onlyOwner {
        teeExtensionRegistry = _teeExtensionRegistry;
    }

    function setTeeMachineRegistry(ITeeMachineRegistry _teeMachineRegistry) external onlyOwner {
        teeMachineRegistry = _teeMachineRegistry;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        owner = newOwner;
    }

    /// @notice Finds and latches this contract's extension id from Flare's
    /// registry after FCC registration. Same scan as the fce scaffold; can
    /// only be set once.
    function setExtensionId() external {
        require(_extensionId == 0, "Extension ID already set.");
        require(address(teeExtensionRegistry) != address(0), "TeeExtensionRegistry not set.");

        uint256 c = teeExtensionRegistry.nextPublicExtensionId();
        for (uint256 i = FIRST_PUBLIC_EXTENSION_ID; i < c; ++i) {
            if (teeExtensionRegistry.getTeeExtensionInstructionsSender(i) == address(this)) {
                _extensionId = i;
                return;
            }
        }
        revert("Extension ID not found.");
    }

    function extensionId() external view returns (uint256) {
        return _extensionId;
    }

    // ---- internals ----

    function _requireExtensionId() internal view returns (uint256) {
        require(_extensionId != 0, "Extension ID is not set.");
        return _extensionId;
    }

    /// @dev Lowercase 0x-prefixed address, the form the Go enclave parses.
    function _toHexString(address value) internal pure returns (string memory) {
        return _toHexString(abi.encodePacked(value), 20);
    }

    /// @dev Lowercase 0x-prefixed bytes32, matching the requestHash the browser
    /// anchored — the enclave looks the sealed blob up by this exact string.
    function _toHexString32(bytes32 value) internal pure returns (string memory) {
        return _toHexString(abi.encodePacked(value), 32);
    }

    function _toHexString(bytes memory raw, uint256 length) private pure returns (string memory) {
        bytes memory alphabet = "0123456789abcdef";
        bytes memory out = new bytes(2 + length * 2);
        out[0] = "0";
        out[1] = "x";
        for (uint256 i = 0; i < length; ++i) {
            out[2 + i * 2] = alphabet[uint8(raw[i]) >> 4];
            out[3 + i * 2] = alphabet[uint8(raw[i]) & 0x0f];
        }
        return string(out);
    }
}
