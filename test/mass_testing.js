'use strict';

const DuskToken = artifacts.require('DuskToken');
const Prestaking = artifacts.require('Prestaking');

let tokenInstance;
let prestakingInstance;

async function advanceTime(time) {
	let id = Date.now();

	return new Promise((resolve, reject) => {
		web3.currentProvider.send({
			jsonrpc: "2.0",
			method: "evm_increaseTime",
			params: [time],
			id: id
		},
		err1 => {
			if (err1) return reject(err1); 

			web3.currentProvider.send({
				jsonrpc: "2.0",
				method: "evm_mine",
				id: id + 1
			},
			(err2, res) => {
				return err2 ? reject(err2) : resolve(res);
			});
		});
	});
};

contract('Prestaking', async (accounts) => {
	before(async () => {
		tokenInstance = await DuskToken.deployed();
		prestakingInstance = await Prestaking.deployed();
		await tokenInstance.transfer(prestakingInstance.address, '100000000000000000000000000', 
			{ from: accounts[0], gas: '1000000' });
		await tokenInstance.transfer(accounts[1], '250000', { from: accounts[0], gas: '1000000' });
		await tokenInstance.transfer(accounts[2], '500000', { from: accounts[0], gas: '1000000' });
		await tokenInstance.transfer(accounts[3], '100000', { from: accounts[0], gas: '1000000' });
		await tokenInstance.transfer(accounts[4], '250000', { from: accounts[0], gas: '1000000' });
		await tokenInstance.transfer(accounts[5], '250000', { from: accounts[0], gas: '1000000' });
    });
    
    describe('mass testing', () => {
        before(async () => {
            for (let i = 0; i < 100; i++) {
                let account = await web3.eth.personal.newAccount('1234');
                await web3.eth.personal.unlockAccount(account, '1234', 100);
                await web3.eth.sendTransaction({ from: accounts[9], to: account, value: 2000000 });
                await tokenInstance.transfer(account, 250000, { from: accounts[0], gas: '1000000' });
                await tokenInstance.approve(prestakingInstance.address, 250000, { from: account, gas: '1000000' });
                await prestakingInstance.stake({ from: account, gas: '1000000' });
            }
        });

        it('should let us comfortably calculate rewards day by day', async () => {
            for(let i = 0; i < 10; i++) {
                advanceTime(24*60*60);
                await prestakingInstance.updateDistribution({ from: accounts[0], gas: '10000000' });
            }
        });
    });
});