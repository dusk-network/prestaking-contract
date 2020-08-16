# DUSK Pre-staking Ethereum Smart Contract

This repository contains the smart contract code for the DUSK pre-staking contract. The aim is to have a smart contract, which can lock up DUSK ERC-20 tokens, in return for a daily reward.

The DUSK pre-staking campaign can be found [here](https://staking.dusk.network/).

The contract has been independently audited by a third party ([Cyber Unit](https://cyberunit.tech/)). The audit report can be found [here](./docs/audit_report.pdf).

For testing purposes, this repository also contains the smart contract code for the DUSK ERC-20 token. This contract can otherwise be ignored.

The tests were ran with `truffle` version 5.1.34, with the contracts compiled with `solc` version 0.6.12. The coverage reports were generated with `solidity-coverage` 0.7.9. Test coverage is currently 100% on all fields, except for lines - this is due to the fact that `solidity-coverage` does not seem to register when the `receive` function is triggered. Despite this, there is a test included in the suite which ensures that any ether received is reverted. (`test/prestaking.js:525`).

To run the tests, ensure you have an instance of Ganache running on port 7545. If, for any reason, you need to use a different port, just change it in the `truffle-config.js` file. To get a coverage report, simply run `truffle run coverage`. Note that no Ganache instance is required when running this command, as it starts up and tears down a server automatically.