var DuskToken = artifacts.require("./DuskToken.sol");
var Prestaking = artifacts.require("./Prestaking.sol");

module.exports = function(deployer) {
  deployer.deploy(DuskToken).then(function() {
    return deployer.deploy(Prestaking, DuskToken.address, 250000, 250000);
  });
};