const LedgerProvider = require("truffle-ledger-provider");
var ledgerOptions = {
  networkId: 1, // mainnet
  accountsOffset: 0 // we use the first address
};

module.exports = {
  networks: {
    development: {
      host: "127.0.0.1",
      port: 8555,
      network_id: "*" // Match any network id
    },
    coverage: {
      host: "localhost",
      network_id: "*",
      port: 8555,         // <-- If you change this, also set the port option in .solcover.js.
      gas: 0xfffffffffff, // <-- Use this high gas value
      gasPrice: 0x01      // <-- Use this low gas price
    }
  },
  compilers: {
    solc: {
      version: "0.6.11"
    }
  }
};