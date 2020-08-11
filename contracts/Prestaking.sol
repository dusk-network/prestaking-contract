// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

/**
 * @title The DUSK Prestaking Contract.
 * @author Jules de Smit
 * @notice This contract will facilitate staking for the DUSK ERC-20 token.
 */
contract Prestaking is Ownable {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;
    
    // The DUSK contract.
    IERC20 private _token;
    
    // Holds all of the information for a staking individual.
    struct Staker {
        uint    startTime;
        uint    endTime;
        uint256 amount;
        uint256 accumulatedReward;
        uint    cooldownTime;
        bool    active;
        uint256 pendingReward;
    }
    
    mapping(address => Staker) public stakersMap;
    address[] public allStakers;
    uint256 public minimumStake;
    uint256 public maximumStake;
    uint256 public dailyReward;
    uint256 public stakingPool;
    
    uint private lastUpdated;

    bool public active;
    
    modifier onlyStaker() {
        Staker storage staker = stakersMap[msg.sender];
        require(staker.startTime.add(1 days) <= block.timestamp && staker.startTime != 0, "No stake is active for sender address");
        _;
    }

    modifier onlyActive() {
        require(active);
        _;
    }
    
    constructor(IERC20 token, uint256 min, uint256 max, uint256 reward, uint timestamp) public {
        _token = token;
        minimumStake = min;
        maximumStake = max;
        dailyReward = reward;
        lastUpdated = timestamp;
        active = true;
    }
    
    /**
     * @notice Ensure nobody can send Ether to this contract, as it is not supposed to have any.
     */
    receive() external payable {
        revert();
    }
    
    /**
     * @notice Update the minimum stake amount.
     * Can only be called by the contract owner.
     * 
     * @param amount The amount to set the minimum stake to.
     */
    function updateMinimumStake(uint256 amount) external onlyOwner {
        require(amount <= maximumStake, "Given amount exceeds current maximum stake");
        minimumStake = amount;
    }
    
    /**
     * @notice Update the maximum stake amount.
     * Can only be called by the contract owner.
     * 
     * @param amount The amount to set the maximum stake to.
     */
    function updateMaximumStake(uint256 amount) external onlyOwner {
        require(amount >= minimumStake, "Given amount is less than current minimum stake");
        maximumStake = amount;
    }

    /**
     * @notice Update the daily reward amount.
     * Can only be called by the contract owner.
     * 
     * @param amount The amount to set the daily reward to.
     */
    function updateDailyReward(uint256 amount) external onlyOwner {
        dailyReward = amount;
    }

    /**
     * @notice Update the reward distribution.
     */
    function updateDistribution() external onlyActive {
        distributeRewards();
    }

    /**
     * @notice Toggle the contract between active and inactive
     */
    function toggleActive() external onlyOwner {
        active = !active;
    }
    
    /**
     * @notice Lock up a given amount of DUSK in the pre-staking contract.
     * @dev A user is required to approve the amount of DUSK prior to calling this function.
     */
    function stake() external onlyActive {
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
    
    /**
     * @notice Start the cooldown period for withdrawing a reward.
     */
    function startWithdrawReward() external onlyStaker onlyActive {
        Staker storage staker = stakersMap[msg.sender];
        require(staker.cooldownTime == 0, "A withdrawal call has already been triggered");
        require(staker.endTime == 0, "Stake already withdrawn");
        distributeRewards();
        
        staker.cooldownTime = block.timestamp;
        staker.pendingReward = staker.accumulatedReward;
        staker.accumulatedReward = 0;
    }
    
    /**
     * @notice Withdraw the reward. Will only work after the cooldown period has ended.
     */
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
    
    /**
     * @notice Start the cooldown period for withdrawing the stake.
     */
    function startWithdrawStake() external onlyStaker {
        Staker storage staker = stakersMap[msg.sender];
        require(staker.startTime.add(30 days) <= block.timestamp, "Stakes can only be withdrawn 30 days after initial lock up");
        require(staker.endTime == 0, "Stake already withdrawn");
        require(staker.cooldownTime == 0, "A withdrawal call has been triggered - please wait for it to complete before withdrawing your stake");
        
        if (active) {
            // We distribute the rewards first, so that the withdrawing staker
            // receives all of their allocated rewards, before setting an `endTime`.
            distributeRewards();
        }

        staker.endTime = block.timestamp;
        stakingPool = stakingPool.sub(staker.amount);
    }
    
    /**
     * @notice Withdraw the stake, and clear the entry of the caller.
     */
    function withdrawStake() external onlyStaker {
        Staker storage staker = stakersMap[msg.sender];
        require(staker.endTime != 0, "Stake withdrawal call was not yet initiated");
        
        if (block.timestamp.sub(staker.endTime) >= 7 days) {
            removeUser(staker, msg.sender);
        }
    }
    
    /**
     * @notice Update the reward allocation, step-by-step.
     * @dev This function can update the staker's active status, and the staking pool size.
     */
    function distributeRewards() internal {
        while ((block.timestamp.sub(lastUpdated)) > 1 days) {
            lastUpdated = lastUpdated.add(1 days);

            // Update the staking pool for this day
            updateStakingPool();
            
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

    /**
     * @notice Can be used by the contract owner to return a user's stake back to them,
     * without need for going through the withdrawal period. This should only really be used
     * at the end of the campaign, if a user does not manually withdraw their stake.
     * @dev This function only works on single addresses, in order to avoid potential
     * deadlocks caused by high gas requirements.
     */
    function returnStake(address _staker) external onlyOwner {
        Staker storage staker = stakersMap[_staker];
        require(staker.amount > 0, "This person is not staking");

        // If this user has a pending reward, add it to the accumulated reward before
        // paying him out.
        staker.accumulatedReward = staker.accumulatedReward.add(staker.pendingReward);
        removeUser(staker, _staker);
    }

    /**
     * @notice Update the staking pool, if any new entrants are found which have passed
     * the initial waiting period.
     */
    function updateStakingPool() internal {
        for (uint i = 0; i < allStakers.length; i++) {
            Staker storage staker = stakersMap[allStakers[i]];

            // If this staker has just become active, update the staking pool size.
            if (!staker.active && lastUpdated.sub(staker.startTime) >= 1 days) {
                staker.active = true;
                stakingPool = stakingPool.add(staker.amount);
            }
        }
    }

    /**
     * @notice Remove a user from the staking pool. This ensures proper deletion from
     * the stakers map and the stakers array, and ensures that all DUSK is returned to
     * the rightful owner.
     * @param staker The information of the staker in question
     * @param sender The address of the staker in question
     */
    function removeUser(Staker storage staker, address sender) internal {
        uint256 balance = staker.amount.add(staker.accumulatedReward);
        delete stakersMap[sender];
            
        // Delete staker from the array.
        for (uint i = 0; i < allStakers.length; i++) {
            if (allStakers[i] == sender) {
                allStakers[i] = allStakers[allStakers.length-1];
                delete allStakers[allStakers.length-1];
            }
        }
        _token.safeTransfer(sender, balance);
    }
}