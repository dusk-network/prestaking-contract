# DUSK Pre-staking Contract

This document aims to explain the inner workings of the DUSK Pre-staking contract.

## Introduction

The goal of this contract is to allow holders of the DUSK ERC-20 token to lock up their funds, in return for a daily reward. The rules are as follows:
- A stake becomes 'active' (eligible for reaping rewards) 24 hours after submission.
- Rewards are allocated on a per-day basis, meaning that for every 24 hours that a stake is active, a reward is given. If a stake is withdrawn anywhere before the 24-hour mark, that days reward is forfeited.
- Stakes may only be withdrawn after having staked for 30 days or more.
- Rewards are distributed according to stake size. If a user has staked 1M in a 10M pool, he is entitled to 10% of the daily reward.
- Each action performed by a staker has a 7 day cooldown, meaning that a reward or stake can only be actually withdrawn after 7 days of initially requesting so.
- The daily reward and the minimum/maximum staking amounts should be updateable variables on the contract, only allowed to be updated by the contract owner.

## The contract

### Composition

The contract is composed from OpenZeppelin base contracts, and inherits the `Ownable` contract. Additionally, it uses `SafeERC20` and `SafeMath`.

```
using SafeERC20 for IERC20;
using SafeMath for uint256;
```

### Variables

Next up, we define a global variable which should hold the contract address of the DUSK token.

```
// The DUSK contract.
IERC20 private _token;
```

This variable is set in the constructor.

Then, we declare a struct, which is a collection of information related to stakers, participating in the pre-staking campaign through this contract.

```
struct Staker {
    uint    startTime;
    uint    endTime;
    uint256 amount;
    uint256 accumulatedReward;
    uint    cooldownTime;
    bool    active;
    uint256 pendingReward;
}
```

`startTime` and `endTime` are pretty self-explanatory. Just for clarity, `endTime` is set once the staker enters a request for withdrawing their stake, and not once their stake is withdrawn fully (as their details are deleted at that point in time).

The `amount` will store however much has been staked by this individual. 

The `accumulatedReward` will count up as time progresses, and represents the amount of DUSK that a staker can withdraw at any point in time.

The `cooldownTime` logs when a staker enters a request to withdraw their `accumulatedReward`, and is used to check when the cooldown has expired.

The `active` boolean is simply used once during rewards distribution, to determine whether or not this is the stakers first time getting a reward. More information on this is provided in the explanation of the `distributeRewards` function [here](#reward-distribution).

Finally, the `pendingReward` saves an amount of DUSK upon entering a request for withdrawing rewards, and represents the amount of DUSK that will be released after the cooldown ends. When not in cooldown, this variable should always be 0.

Before moving on, we declare a few more global variables for the contract.

```
mapping(address => Staker) public stakersMap;
address[] public allStakers;
uint256 public minimumStake;
uint256 public maximumStake;
uint256 public dailyReward;
uint256 public stakingPool;
uint public cap;
```

`stakersMap` is a mapping of stakers addresses, to their information, stored in a `Staker` struct.

`allStakers` is a list of all addresses, of people that have staked.

`minimumStake`, `maximumStake` and `dailyReward` should be self-explanatory.

`stakingPool` will hold the total amount of DUSK staked at any given time.

`cap` will determine the amount of people allowed to be active stakers at the same time.

And, at the very end, we also declare a variable to hold a timestamp, and a variable to denote the status of the contract.

```
uint private lastUpdated;

bool public active;
```

The first variable tells the contract when the last rewards distribution took place, and serves to avoid duplicate allocation of DUSK. The last variable will determine whether or not rewards will be distributed.

### Constructor

The constructor is used to initialise a couple of the aforementioned global [variables](#variables).

```
constructor(IERC20 token, uint256 min, uint256 max, uint256 reward, uint userCap, uint timestamp) public {
    _token = token;
    minimumStake = min;
    maximumStake = max;
    dailyReward = reward;
    lastUpdated = timestamp;
    cap = userCap;
    active = true;
}
```

Besides setting the token contract address, the minimum and maximum stake, and the daily reward, it also sets the `lastUpdated` variable to the given time. This ensures that the contract will only start calculating rewards from a predetermined point in time, and not from the year 1970. The `active` boolean is also set to `true`, to allow for reward distribution right away.

### Modifiers

Besides the inherited `onlyOwner`, the contract itself has two modifiers. The first one is `onlyStaker`.

```
modifier onlyStaker() {
    Staker storage staker = stakersMap[msg.sender];
    require(staker.startTime.add(1 days) <= block.timestamp && staker startTime != 0, "No stake is active for sender address");
    _;
}
```

This modifier ensures that the caller is indeed an active staker, and is used to guard the [staker actions](#staker-actions).

The second one is `onlyActive`.

```
modifier onlyActive() {
    require(active);
    _;
}
```

This modifier restricts access to certain functions which should not be called when the contract is set to inactive.

### Functionality

It is ensured that empty function calls and ether transfers to this contract are reverted.

```
receive() external payable {
    revert();
}
```

#### Staking

For a user to participate in the pre-staking campaign, he will have to call the `approve` method on the DUSK token contract first off, increasing the allowance for the pre-staking contract. Note that this amount needs to be at least the minimum stake or more - otherwise the `stake` function will fail.

Once approved, the user can then call the `stake` function.

```
function stake() external onlyActive {
    // Enforce cap.
    require(allStakers.length < cap, "Too many stakers active");
    
    // Ensure this staker does not exist yet.
    Staker storage staker = stakersMap[msg.sender];
    require(staker.amount == 0, "Address already known");
    
    // Check that the staker has approved the appropriate amount of DUSK to this contract.
    uint256 balance = _token.allowance(msg.sender, address(this));
    require(balance != 0, "No tokens have been approved for this contract");
    require(balance >= minimumStake, "Insufficient tokens approved for this contract");
    if (balance > maximumStake) {
        balance = maximumStake;
    }
    
    // Set information for this staker.
    allStakers.push(msg.sender);
    staker.amount = balance;
    staker.startTime = block.timestamp;
    
    // Transfer the DUSK to this contract.
    _token.safeTransferFrom(msg.sender, address(this), balance);
}
```

First off, the contract ensures that the cap will not be exceeded, and that this person is not already known. Then, it will inquire the DUSK token contract for its allowance, given by the sender. If this passes all checks, the sender is added to the stakers list, his information is updated, and then the tokens are transferred from the sender to the contract. The user is now officially staking.

#### Reward distribution

The reward distribution happens as follows.

```
function distributeRewards() internal {
    while ((block.timestamp.sub(lastUpdated)) > 1 days) {
        lastUpdated = lastUpdated.add(1 days);

        // Update the staking pool for this day
        updateStakingPool();

        if (!active) {
            continue;
        }
        
        // Allocate rewards for this day.
        for (uint i = 0; i < allStakers.length; i++) {
            Staker storage staker = stakersMap[allStakers[i]];
            
            // Stakers can only start receiving rewards after 1 day of lockup.
            // If the staker has called to withdraw their stake, don't allocate any more rewards to them.
            if (!staker.active || staker.endTime != 0) {
                continue;
            }
            
            // Calculate percentage of reward to be received, and allocate it.
            // Reward is calculated down to a precision of two decimals.
            uint256 reward = staker.amount.mul(10000).mul(dailyReward).div(stakingPool).div(10000);
            staker.accumulatedReward = staker.accumulatedReward.add(reward);
        }
    }
}
```

Note that this function can only be called internally - it is called any time a staker attempts to interact with the contract, to ensure that all statistics are updated before undertaking any further actions.

By checking the `lastUpdated` variable, the contract determines whether it is time to update the reward distribution. If this is far enough in the past, the contract will start a loop, distributing rewards on a day-by-day basis, incrementing the `lastUpdated` timestamp by one day for each iteration.

It will then make sure the staking pool is up to date. It does so through the `updateStakingPool` function.

```
function updateStakingPool() internal {
    uint256 counter = 0;
    for (uint i = 0; i < allStakers.length; i++) {
        Staker storage staker = stakersMap[allStakers[i]];
        // If this staker has just become active, update the staking pool size.
        if (!staker.active && lastUpdated.sub(staker.startTime) >= 1 days) {
            staker.active = true;
            counter = counter.add(staker.amount);
        }
    }

    stakingPool = stakingPool.add(counter);
}
```

For each staker, it first checks if the `startTime` is far enough in the past for them to actually receive any rewards. Allocation should start after 24 hours, so it checks that there is at least 1 day in UNIX time remaining, after subtracting the `startTime` from `lastUpdated`. If this is the case, the stakers `active` boolean is flipped to `true`, and the staking pool is increased by the stakers `amount`.

Back to the `distributeRewards` function. The contract will again loop through all of the stakers, making sure that a staker is `active` before allocating rewards. It also checks if there is a known `endTime`. This will be set the moment a staker requests to withdraw his stake. During the 7 day cooldown period, the staker should no longer be eligible to collect rewards, and this check should prevent that.

Finally, the reward percentage is calculated, up to a precision of two decimals. That calculated reward will then be added to the stakers `accumulatedReward` variable.

#### Staker actions

Once the stake has been accepted, and enough time has passed, the staker starts having a few options to choose from.

##### Withdrawing rewards

To withdraw the accumulated rewards, the staker should first call `startWithdrawReward`.

```
function startWithdrawReward() external onlyStaker onlyActive {
    Staker storage staker = stakersMap[msg.sender];
    require(staker.cooldownTime == 0, "A withdrawal call has already been triggered");
    require(staker.endTime == 0, "Stake already withdrawn");
    distributeRewards();
    
    staker.cooldownTime = block.timestamp;
    staker.pendingReward = staker.accumulatedReward;
    staker.accumulatedReward = 0;
}
```

A number of checks are initially performed. The contract ensures the caller is actually an active staker, that the contract is active, that no cooldown is currently running, and it ensures that the staker has not already requested to withdraw their stake. In any of these cases, the function should revert.

Then, [rewards are distributed](#reward-distribution), to ensure the right amount of DUSK is set to pending for withdrawal.

The `accumulatedReward` is then copied to the `pendingReward`, which is the amount that can be released after the cooldown ends. The `accumulatedReward` is reset to 0.

After a 7 day cooldown, the staker can call `withdrawReward`.

```
function withdrawReward() external onlyStaker {
    Staker storage staker = stakersMap[msg.sender];
    require(staker.cooldownTime != 0, "The withdrawal cooldown has not been triggered");

    if (block.timestamp.sub(staker.cooldownTime) >= 7 days) {
        uint256 reward = staker.pendingReward;
        staker.cooldownTime = 0;
        staker.pendingReward = 0;
        _token.safeTransfer(msg.sender, reward);
    }
}
```

The contract checks if the caller is an active staker, and makes sure there is an actual cooldown time known. Following that, the contract checks if the cooldown period (7 days) has passed. If yes, the `cooldownTime` and `pendingReward` are then reset, and the pending tokens are released to the caller.

##### Withdrawing the stake

To withdraw the stake, and any remaining reward, the staker can call `startWithdrawStake`.

```
function startWithdrawStake() external onlyStaker {
    Staker storage staker = stakersMap[msg.sender];
    require(staker.startTime.add(30 days) <= block.timestamp, "Stakes can only be withdrawn 30 days after initial lock up");
    require(staker.endTime == 0, "Stake already withdrawn");
    require(staker.cooldownTime == 0, "A withdrawal call has been triggered - please wait for it to complete before withdrawing your stake");
    
    // We distribute the rewards first, so that the withdrawing staker
    // receives all of their allocated rewards, before setting an `endTime`.
    distributeRewards();
    staker.endTime = block.timestamp;
    stakingPool = stakingPool.sub(staker.amount);
}
```

The contract checks if the caller is an active staker, and makes sure the 30 day initial lock-up has passed. Furthermore, it ensures that the staker has not already requested to withdraw their stake, and that they have no current cooldown going on for reward withdrawal.

[Rewards are then distributed](#reward-distribution), to make sure all statistics are completely up-to-date. The stakers `endTime` field is then populated with the current time, to signify that the cooldown period of 7 days has begun, and that the staker can no longer reap any rewards. His stake is then removed from the `stakingPool`.

After a 7 day cooldown, the staker can call `withdrawStake`.

```
function withdrawStake() external onlyStaker {
    Staker storage staker = stakersMap[msg.sender];
    require(staker.endTime != 0, "Stake withdrawal call was not yet initiated");
    
    if (block.timestamp.sub(staker.endTime) >= 7 days) {
        uint256 balance = staker.amount.add(staker.accumulatedReward);
        delete stakersMap[msg.sender];
        
        // Delete staker from the array.
        for (uint i = 0; i < allStakers.length; i++) {
            if (allStakers[i] == msg.sender) {
                allStakers[i] = allStakers[allStakers.length-1];
                delete allStakers[allStakers.length-1];
            }
        }
        _token.safeTransfer(msg.sender, balance);
    }
}
```

After making sure that the caller is an active staker, and has previously signaled to withdraw their stake, the cooldown period is then evaluated. If 7 days have passed, the total amount of DUSK to release is then calculated as `amount + accumulatedReward`. The stakers records are then deleted, and their address removed from the `allStakers` list, before releasing the tokens back to the staker. He is now officially no longer staking.

#### Updating distribution

The reward distribution can be updated manually by calling the `updateDistribution` function.

```
function updateDistribution() external {
    distributeRewards();
}
```

This function simply runs the internal `distributeRewards` call, and can be called at any point in time, by anyone. This allows users to update their reward information without needing to start a withdrawal action.

#### Contract information

To retrieve the amount of stakers currently active on the contract, simply call the `stakersAmount` function.

```
function stakersAmount() external view returns (uint) {
    return allStakers.length;
}
```

#### Owner actions

The owner gets the option to modify the minimum stake, the maximum stake, and the daily reward, at any point.

```
function updateMinimumStake(uint256 amount) external onlyOwner {
    require(amount <= maximumStake, "Given amount exceeds current maximum stake");
    minimumStake = amount;
}

function updateMaximumStake(uint256 amount) external onlyOwner {
    require(amount >= minimumStake, "Given amount is less than current minimum stake");
    maximumStake = amount;
}

function updateDailyReward(uint256 amount) external onlyOwner {
    dailyReward = amount;
}

function toggleActive() external onlyOwner {
    active = !active;
}

function adjustCap(uint newCap) external onlyOwner {
    cap = newCap;
}
```

As you can see, all functions are guarded with the `onlyOwner` modifier. Additionally, the stake update functions include sanity checks, to ensure the minimum and maximum don't cross each other.

##### Returning stakes

As a contingency, the owner can return stakes to the users by calling the `returnStake` function.

```
function returnStake(address _staker) external onlyOwner {
    Staker storage staker = stakersMap[_staker];
    require(staker.amount > 0, "This person is not staking");

    // If this user has a pending reward, add it to the accumulated reward before
    // paying him out.
    staker.accumulatedReward = staker.accumulatedReward.add(staker.pendingReward);
    removeUser(staker, _staker);
    }
```

Which essentially instantly returns the accumulated reward and the stake to the user with the given address. This function can be used in the incredibly unlikely case of contract failure, to secure the users assets, as well as returning users assets after the campaign has completed, in case they have forgotten to withdraw their DUSK.