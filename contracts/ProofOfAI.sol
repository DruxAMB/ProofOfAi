// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Initializable} from "openzeppelin-contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "openzeppelin-contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "openzeppelin-contracts-upgradeable/access/OwnableUpgradeable.sol";

/// @title ProofOfAI — content authenticity registry.
/// Creators hash content in the browser (keccak256 of file bytes or text) and
/// notarize the hash on-chain with a kind tag. Anyone can then verify when a
/// hash was first recorded and by whom. Content itself never leaves the client.
contract ProofOfAI is Initializable, UUPSUpgradeable, OwnableUpgradeable {
    /// kind values: 0 = text, 1 = image, 2 = other
    struct Record {
        address author;
        uint64 timestamp;
        uint8 kind;
    }

    mapping(bytes32 => Record) private _records;
    uint256 public totalNotarized;

    event Notarized(
        bytes32 indexed contentHash,
        address indexed author,
        uint64 timestamp,
        uint8 kind
    );

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() { _disableInitializers(); }

    function initialize(address owner_) external initializer {
        __Ownable_init(owner_);
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    function notarize(bytes32 contentHash, uint8 kind) external {
        require(contentHash != bytes32(0), "empty hash");
        require(kind <= 2, "bad kind");
        require(_records[contentHash].timestamp == 0, "already notarized");

        _records[contentHash] = Record({
            author: msg.sender,
            timestamp: uint64(block.timestamp),
            kind: kind
        });
        unchecked {
            ++totalNotarized;
        }
        emit Notarized(contentHash, msg.sender, uint64(block.timestamp), kind);
    }

    function verify(bytes32 contentHash)
        external
        view
        returns (bool exists, address author, uint64 timestamp, uint8 kind)
    {
        Record memory r = _records[contentHash];
        return (r.timestamp != 0, r.author, r.timestamp, r.kind);
    }

    uint256[48] private __gap;
}
