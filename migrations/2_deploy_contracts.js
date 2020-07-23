var DuskToken = artifacts.require("./DuskToken.sol");
var Prestaking = artifacts.require("./Prestaking.sol");

module.exports = function(deployer) {
  deployer.deploy(DuskToken, "Dusk Network", "DUSK").then(function() {
    return deployer.deploy(Prestaking, DuskToken.address, 250000, 250000, 200);
  });
};