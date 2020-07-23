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
	});
	

	describe('pre-timetravel', () => {
		it('should properly set the owner', async () => {
			let owner = await prestakingInstance.owner();
			assert.strictEqual(owner, accounts[0]);
		});
		
		it('should not allow a user to stake, if they have not given the contract any approval', async () => {
			// The contract will be deployed with a min/max stake set to 250000.
			try {
				await prestakingInstance.stake({ from: accounts[1], gas: '1000000' });

				// This should not succeed
				assert(false);
			} catch(e) {
				assert(true);
			}
		});

		it('should not allow a user to stake, if they have not given the contract a proper approval', async () => {
			try {
				await tokenInstance.approve(prestakingInstance.address, 100000, { from: accounts[3], gas: '1000000' });
				await prestakingInstance.stake({ from: accounts[3], gas: '1000000' });

				// This should not succeed
				assert(false);
			} catch(e) {
				assert(true);
			}
		});

		it('should allow the user to stake, once a proper approval has been given', async () => {
			// The contract will be deployed with a min/max stake set to 250000.
			await tokenInstance.approve(prestakingInstance.address, 250000, { from: accounts[1], gas: '1000000' });
			await prestakingInstance.stake({ from: accounts[1], gas: '1000000' });

			// Check that the new information is correct.
			let currentTime = Math.floor(Date.now()/1000);
			let staker = await prestakingInstance.stakersMap.call(accounts[1], { from: accounts[1] });
			assert.isAtMost(staker.startTime.toNumber(), currentTime);
			assert.strictEqual(staker.amount.toString(), "250000");
			assert.strictEqual(staker.active, false);
			assert.strictEqual(staker.endTime.toString(), "0");
			assert.strictEqual(staker.accumulatedReward.toString(), "0");
			assert.strictEqual(staker.pendingReward.toString(), "0");
		});

		it('should not allow a user to stake twice', async () => {
			try {
				await tokenInstance.approve(prestakingInstance.address, 250000, { from: accounts[1], gas: '1000000' });
				await prestakingInstance.stake({ from: accounts[1], gas: '1000000' });
				assert(false);
			} catch(e) {
				assert(true);
			}
		});

		it('should default to the maximum stake, in case of the approval being greater', async () => {
			await tokenInstance.approve(prestakingInstance.address, 500000, { from: accounts[2], gas: '1000000' });
			await prestakingInstance.stake({ from: accounts[2], gas: '1000000' });

			// Check that the staker amount is 250000 instead of 500000
			let staker = await prestakingInstance.stakersMap.call(accounts[2], { from: accounts[2] });
			assert.strictEqual(staker.amount.toString(), "250000");
		});

		it('should only allow a staker to start a reward withdrawal call', async () => {
			try {
				await prestakingInstance.startWithdrawReward({ from: accounts[9], gas: '1000000' });
				assert(false);
			} catch(e) {
				assert(true);
			}
		});

		it('should only allow a staker to finalize a reward withdrawal call', async () => {
			try {
				await prestakingInstance.withdrawReward({ from: accounts[9], gas: '1000000' });
				assert(false);
			} catch(e) {
				assert(true);
			}
		});

		it('should only allow a staker to start a stake withdrawal call', async () => {
			try {
				await prestakingInstance.startWithdrawStake({ from: accounts[9], gas: '1000000' });
				assert(false);
			} catch(e) {
				assert(true);
			}
		});

		it('should only allow a staker to finalize a stake withdrawal call', async () => {
			try {
				await prestakingInstance.withdrawStake({ from: accounts[9], gas: '1000000' });
				assert(false);
			} catch(e) {
				assert(true);
			}
		});

		it('should not allow a staker to withdraw rewards before the first day has passed', async () => {
			try {
				await prestakingInstance.startWithdrawReward({ from: accounts[1], gas: '1000000' });
				assert(false);
			} catch(e) {
				assert(true);
			}
		});
	});

	// Now, fast-forward a day, to set this staker to `active`
	describe('first timetravel', () => {
		before(async () => {
			await advanceTime(24*60*60);
		});

		it('should not allow a staker to withdraw their stake before the first thirty days have passed', async () => {
			try {
				await prestakingInstance.startWithdrawStake({ from: accounts[1], gas: '1000000' });
				assert(false);
			} catch(e) {
				assert(true);
			}
		});

		it('should not allow a staker to withdraw a reward without starting the cooldown first', async () => {
			try {
				await prestakingInstance.withdrawReward({ from: accounts[1], gas: '1000000' });
				assert(false);
			} catch(e) {
				assert(true);
			}
		});

		it('should not allow a staker to withdraw their stake without starting the cooldown first', async () => {
			try {
				await prestakingInstance.withdrawStake({ from: accounts[1], gas: '1000000' });
				assert(false);
			} catch(e) {
				assert(true);
			}
		});		
	});

	// Fast-forward 7 days, to allow for some reward accumulation.
	describe('second timetravel', () => {
		before(async () => {
			await advanceTime(7*24*60*60);
		});

		it('should allow a staker to start their withdrawal cooldown, after waiting for the initial period', async () => {
			await prestakingInstance.startWithdrawReward({ from: accounts[1], gas: '1000000' });

			// TODO: check for appropriate stats
		});

		it('should not allow the staker to withdraw their reward before the cooldown has ended', async () => {
			try {
				await prestakingInstance.withdrawReward({ from: accounts[1], gas: '1000000' });
				assert(false);
			} catch(e) {
				assert(true);
			}
		});

		it('should not allow a staker to start the cooldown if it has already started', async () => {
			try {
				await prestakingInstance.startWithdrawReward({ from: accounts[1], gas: '1000000' });
				assert(false);
			} catch(e) {
				assert(true);
			}
		});
	});

	// Fast-forward 8 days, to ensure that the reward can now be collected.
	describe('third timetravel', () => {
		before(async () => {
			await advanceTime(8*24*60*60);
		});

		it('should allow a staker to collect their reward after waiting for the cooldown to end', async () => {
			await prestakingInstance.withdrawReward({ from: accounts[1], gas: '1000000' });

			// TODO: check appropriate stats, and staker balance.
		});
	});

	// Fast-forward another 15 days, so that the staker can withdraw their stake.
	describe('fourth timetravel', () => {
		before(async () => {
			await advanceTime(15*24*60*60);
		});

		it('should allow a staker to start the stake withdrawal cooldown after 30 days', async () => {
			await prestakingInstance.startWithdrawStake({ from: accounts[1], gas: '1000000' });

			// TODO: check appropriate stats, and staker balance.
		});

		it('should not allow the staker to withdraw his stake before the cooldown ends', async () => {
			try {
				await prestakingInstance.withdrawStake({ from: accounts[1], gas: '1000000' });
				assert(false);
			} catch(e) {
				assert(true);
			}
		});

		it('should no longer allow the staker to start reward withdrawal after triggering stake withdrawal', async () => {
			try {
				await prestakingInstance.startWithdrawReward({ from: accounts[1], gas: '1000000' });
				assert(false);
			} catch(e) {
				assert(true);
			}
		});

		it('should not allow the staker to start the stake withdrawal cooldown more than once', async () => {
			try {
				await prestakingInstance.startWithdrawStake({ from: accounts[1], gas: '1000000' });
				assert(false);
			} catch(e) {
				assert(true);
			}
		});
	});

	// Fast-forward 8 more days, for the staker to be able to withdraw his stake.
	describe('fifth timetravel', () => {
		before(async () => {
			await advanceTime(8*24*60*60);
		});

		it('should allow a staker to withdraw his stake after the cooldown', async () => {
			await prestakingInstance.withdrawStake({ from: accounts[1], gas: '1000000' });

			// TODO: check appropriate stats, and staker balance.
		});

		it('should delete the staker from the storage after his stake is withdrawn', async () => {
			let staker = await prestakingInstance.stakersMap.call(accounts[1], { from: accounts[1] });
			assert.strictEqual(staker.startTime.toString(), "0");
			assert.strictEqual(staker.amount.toString(), "0");
			assert.strictEqual(staker.active, false);
			assert.strictEqual(staker.endTime.toString(), "0");
			assert.strictEqual(staker.accumulatedReward.toString(), "0");
			assert.strictEqual(staker.pendingReward.toString(), "0");
		});

		it('should not let a staker start the stake withdrawal when in reward withdrawal cooldown', async() => {
			await prestakingInstance.startWithdrawReward({ from: accounts[2], gas: '1000000' });

			try {
				await prestakingInstance.startWithdrawStake({ from: accounts[2], gas: '1000000' });
				assert(false);
			} catch(e) {
				assert(true);
			}
		});
	});

	describe('variable adjustment functions', () => {
		it('should not allow a non-owner to adjust the minimum stake', async () => {
			try {
				await prestakingInstance.updateMinimumStake(100000, { from: accounts[9], gas: '1000000' });
				assert(false);
			} catch(e) {
				assert(true);
			}
		});

		it('should not allow a non-owner to adjust the maximum stake', async () => {
			try {
				await prestakingInstance.updateMaximumStake(500000, { from: accounts[9], gas: '1000000' });
				assert(false);
			} catch(e) {
				assert(true);
			}
		});

		it('should not allow a non-owner to adjust the daily reward', async () => {
			try {
				await prestakingInstance.updateDailyReward(100, { from: accounts[9], gas: '1000000' });
				assert(false);
			} catch(e) {
				assert(true);
			}
		});

		it('should not allow the owner to let the minimum stake exceed the maximum stake', async () => {
			try {
				await prestakingInstance.updateMinimumStake(500000, { from: accounts[0], gas: '1000000' });
				assert(false);
			} catch(e) {
				assert(true);
			}
		});

		it('should not allow the owner to let the maximum stake be less than the minimum stake', async () => {
			try {
				await prestakingInstance.updateMaximumStake(100000, { from: accounts[0], gas: '1000000' });
				assert(false);
			} catch(e) {
				assert(true);
			}
		});

		it('should allow the owner to adjust the minimum stake', async () => {
			await prestakingInstance.updateMinimumStake(100000, { from: accounts[0], gas: '1000000' });
		});

		it('should allow the owner to adjust the maximum stake', async () => {
			await prestakingInstance.updateMaximumStake(500000, { from: accounts[0], gas: '1000000' });
		});

		it('should allow the owner to adjust the daily reward', async () => {
			await prestakingInstance.updateDailyReward(100, { from: accounts[0], gas: '1000000' });
		});
	});

	describe("misc", () => {
		it('should revert when ether is sent', async () => {
			try {
				await web3.sendTransaction({ to: prestakingInstance.address, from: accounts[0], value: web3.toWei("0.5", "ether") });
				assert(false);
			} catch(e) {
				assert(true);
			}
		});
	});
});