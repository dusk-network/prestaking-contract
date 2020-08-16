module.exports = {
  networks: {
    development: {
      host: "127.0.0.1",
      port: 7545,
      network_id: "*", // Match any network id
      gas: 0x989680, // <-- Use this high gas value
      gasPrice: 0x01      // <-- Use this low gas price
    },
    coverage: {
      host: "localhost",
      network_id: "*",
      port: 7545,         // <-- If you change this, also set the port option in .solcover.js.
      gas: 0xfffffffffff, // <-- Use this high gas value
      gasPrice: 0x01      // <-- Use this low gas price
    }
  },
  compilers: {
    solc: {
      version: "0.6.12"
    }
  },
  plugins: ["solidity-coverage"]
};