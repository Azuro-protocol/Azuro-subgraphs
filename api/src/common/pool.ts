import {
  Address,
  BigDecimal, BigInt, bigInt, dataSource, ethereum, log,
} from '@graphprotocol/graph-ts'

import { LiquidityPoolContract, LiquidityPoolNft, LiquidityPoolTransaction } from '../../generated/schema'
import {
  CHAINS_IDS,
  CUSTOM_FIRST_BLOCK_TIMESTAMPS,
  LP_TRANSACTION_TYPE_DEPOSIT,
  LP_TRANSACTION_TYPE_WITHDRAWAL,
  X_PROFIT,
  X_PROFIT_DIVIDER,
} from '../constants'
import { addUniqueItem } from '../utils/array'
import { toDecimal } from '../utils/math'
import { getLiquidityPoolNftEntityId } from '../utils/schema'
import { daysBetweenTimestamps } from '../utils/time'
import { getERC20TokenBalance, getERC20TokenDecimals, getERC20TokenSymbol } from './erc20'


function updatePoolOnCommonEvents(
  liquidityPoolContractEntity: LiquidityPoolContract,
  block: ethereum.Block,
): LiquidityPoolContract {
  liquidityPoolContractEntity.lastCalculatedBlockNumber = block.number
  liquidityPoolContractEntity.lastCalculatedBlockTimestamp = block.timestamp

  liquidityPoolContractEntity.daysSinceDeployment = BigInt.fromI64(
    daysBetweenTimestamps(
      liquidityPoolContractEntity.firstCalculatedBlockTimestamp,
      liquidityPoolContractEntity.lastCalculatedBlockTimestamp,
    ),
  )

  if (
    liquidityPoolContractEntity.daysSinceDeployment.gt(BigInt.zero())
    && liquidityPoolContractEntity.depositedAmount.minus(liquidityPoolContractEntity.withdrawnAmount).gt(BigInt.zero())
  ) {
    liquidityPoolContractEntity.rawApr = liquidityPoolContractEntity.betsAmount
      .minus(liquidityPoolContractEntity.wonBetsAmount)
      .times(X_PROFIT)
      .times(BigInt.fromString('365'))
      .times(bigInt.pow(BigInt.fromString('10'), 8)) // too low number * 10^8
      .div(X_PROFIT_DIVIDER)
      .div(liquidityPoolContractEntity.daysSinceDeployment)
      .div(liquidityPoolContractEntity.depositedAmount.minus(liquidityPoolContractEntity.withdrawnAmount))

    // (x 100 - percents)
    liquidityPoolContractEntity.apr = toDecimal(liquidityPoolContractEntity.rawApr, 6)
  }

  const balance = getERC20TokenBalance(liquidityPoolContractEntity.token, liquidityPoolContractEntity.address)

  if (balance && balance.notEqual(BigInt.zero())) {
    liquidityPoolContractEntity.rawTvl = balance
    liquidityPoolContractEntity.tvl = toDecimal(balance, liquidityPoolContractEntity.tokenDecimals)
  }

  return liquidityPoolContractEntity
}

export function createPoolEntity(
  version: string,
  coreAddress: string,
  liquidityPoolAddress: string,
  tokenAddress: string,
  createBlock: ethereum.Block,
): LiquidityPoolContract {
  const liquidityPoolContractEntity = new LiquidityPoolContract(liquidityPoolAddress)

  liquidityPoolContractEntity.address = liquidityPoolAddress
  liquidityPoolContractEntity.coreAddresses = [coreAddress]
  liquidityPoolContractEntity.token = tokenAddress

  liquidityPoolContractEntity.type = version

  const network = dataSource.network()

  liquidityPoolContractEntity.chainName = network

  let chainId = CHAINS_IDS.mustGet('gnosis')

  if (CHAINS_IDS.isSet(network)) {
    chainId = CHAINS_IDS.mustGet(network)
  }

  liquidityPoolContractEntity.chainId = BigInt.fromString(chainId).toI32()

  liquidityPoolContractEntity.tokenDecimals = getERC20TokenDecimals(tokenAddress)
  liquidityPoolContractEntity.asset = getERC20TokenSymbol(tokenAddress)

  liquidityPoolContractEntity.rawApr = BigInt.zero()
  liquidityPoolContractEntity.apr = BigDecimal.fromString('0')

  liquidityPoolContractEntity.betsAmount = BigInt.zero()
  liquidityPoolContractEntity.betsCount = BigInt.zero()

  liquidityPoolContractEntity.wonBetsAmount = BigInt.zero()
  liquidityPoolContractEntity.wonBetsCount = BigInt.zero()

  liquidityPoolContractEntity.rawTvl = getERC20TokenBalance(tokenAddress, liquidityPoolAddress)
  liquidityPoolContractEntity.tvl = toDecimal(
    liquidityPoolContractEntity.rawTvl,
    liquidityPoolContractEntity.tokenDecimals,
  )

  liquidityPoolContractEntity.firstCalculatedBlockNumber = createBlock.number

  let firstCalculatedBlockTimestamp = createBlock.timestamp

  if (CUSTOM_FIRST_BLOCK_TIMESTAMPS.isSet(liquidityPoolAddress)) {
    firstCalculatedBlockTimestamp = CUSTOM_FIRST_BLOCK_TIMESTAMPS.get(liquidityPoolAddress)!
  }

  liquidityPoolContractEntity.firstCalculatedBlockTimestamp = firstCalculatedBlockTimestamp

  liquidityPoolContractEntity.lastCalculatedBlockNumber = createBlock.number
  liquidityPoolContractEntity.lastCalculatedBlockTimestamp = createBlock.timestamp

  liquidityPoolContractEntity.daysSinceDeployment = BigInt.zero()

  liquidityPoolContractEntity.depositedAmount = BigInt.zero()
  liquidityPoolContractEntity.withdrawnAmount = BigInt.zero()

  liquidityPoolContractEntity.withdrawTimeout = BigInt.zero()

  liquidityPoolContractEntity.depositedWithStakingAmount = BigInt.zero()
  liquidityPoolContractEntity.withdrawnWithStakingAmount = BigInt.zero()

  liquidityPoolContractEntity.save()

  return liquidityPoolContractEntity
}

export function depositLiquidity(
  liquidityPoolAddress: string,
  amount: BigInt,
  leaf: BigInt,
  account: string,
  block: ethereum.Block,
  tx: ethereum.Transaction,
): LiquidityPoolTransaction | null {
  const liquidityPoolContractEntity = LiquidityPoolContract.load(liquidityPoolAddress)

  // TODO remove later
  if (!liquidityPoolContractEntity) {
    log.error('depositLiquidity liquidityPoolContractEntity not found. liquidityPoolAddress = {}', [
      liquidityPoolAddress,
    ])

    return null
  }

  liquidityPoolContractEntity.depositedAmount = liquidityPoolContractEntity.depositedAmount.plus(amount)

  if (liquidityPoolContractEntity.liquidityManager) {
    liquidityPoolContractEntity.depositedWithStakingAmount = liquidityPoolContractEntity.depositedWithStakingAmount.plus(amount)
  }

  updatePoolOnCommonEvents(liquidityPoolContractEntity, block)

  liquidityPoolContractEntity.save()

  const liquidityPoolNftEntityId = getLiquidityPoolNftEntityId(liquidityPoolAddress, leaf.toString())
  const liquidityPoolNftEntity = new LiquidityPoolNft(liquidityPoolNftEntityId)

  liquidityPoolNftEntity.nftId = leaf
  liquidityPoolNftEntity.owner = account
  liquidityPoolNftEntity.historicalOwners = [account]
  liquidityPoolNftEntity.liquidityPool = liquidityPoolContractEntity.id

  liquidityPoolNftEntity.rawDepositedAmount = amount
  liquidityPoolNftEntity.depositedAmount = toDecimal(amount, liquidityPoolContractEntity.tokenDecimals)

  liquidityPoolNftEntity.rawWithdrawnAmount = BigInt.zero()
  liquidityPoolNftEntity.withdrawnAmount = BigDecimal.fromString('0')
  liquidityPoolNftEntity.isFullyWithdrawn = false
  liquidityPoolNftEntity.createBlockNumber = block.number
  liquidityPoolNftEntity.createBlockTimestamp = block.timestamp
  liquidityPoolNftEntity.withdrawTimeout = block.timestamp.plus(liquidityPoolContractEntity.withdrawTimeout)
  liquidityPoolNftEntity.save()

  const transactionEntity = new LiquidityPoolTransaction(tx.hash.toHexString())

  transactionEntity.txHash = tx.hash.toHexString()
  transactionEntity.account = account
  transactionEntity.type = LP_TRANSACTION_TYPE_DEPOSIT.toString()
  transactionEntity.nft = liquidityPoolNftEntity.id
  transactionEntity.rawAmount = amount
  transactionEntity.amount = toDecimal(amount, liquidityPoolContractEntity.tokenDecimals)
  transactionEntity.blockNumber = block.number
  transactionEntity.blockTimestamp = block.timestamp
  transactionEntity.liquidityPool = liquidityPoolContractEntity.id

  transactionEntity.save()

  return transactionEntity
}

export function withdrawLiquidity(
  liquidityPoolAddress: string,
  amount: BigInt,
  leaf: BigInt,
  account: string,
  isFullyWithdrawn: boolean,
  block: ethereum.Block,
  tx: ethereum.Transaction,
): LiquidityPoolTransaction | null {
  const liquidityPoolContractEntity = LiquidityPoolContract.load(liquidityPoolAddress)

  // TODO remove later
  if (!liquidityPoolContractEntity) {
    log.error('withdrawLiquidity liquidityPoolContractEntity not found. liquidityPoolAddress = {}', [
      liquidityPoolAddress,
    ])

    return null
  }

  liquidityPoolContractEntity.withdrawnAmount = liquidityPoolContractEntity.withdrawnAmount.plus(amount)

  if (liquidityPoolContractEntity.liquidityManager) {
    liquidityPoolContractEntity.withdrawnWithStakingAmount = liquidityPoolContractEntity.withdrawnWithStakingAmount.plus(amount)
  }

  updatePoolOnCommonEvents(liquidityPoolContractEntity, block)

  liquidityPoolContractEntity.save()

  const liquidityPoolNftEntityId = getLiquidityPoolNftEntityId(liquidityPoolAddress, leaf.toString())
  const liquidityPoolNftEntity = LiquidityPoolNft.load(liquidityPoolNftEntityId)

  // TODO remove later
  if (!liquidityPoolNftEntity) {
    log.error('withdrawLiquidity liquidityPoolNftEntity not found. liquidityPoolNftEntityId = {}', [
      liquidityPoolNftEntityId,
    ])

    return null
  }

  liquidityPoolNftEntity.rawWithdrawnAmount = liquidityPoolNftEntity.rawWithdrawnAmount.plus(amount)
  liquidityPoolNftEntity.withdrawnAmount = toDecimal(
    liquidityPoolNftEntity.rawWithdrawnAmount,
    liquidityPoolContractEntity.tokenDecimals,
  )

  liquidityPoolNftEntity.isFullyWithdrawn = isFullyWithdrawn

  liquidityPoolNftEntity.save()

  const transactionEntity = new LiquidityPoolTransaction(tx.hash.toHexString())

  transactionEntity.txHash = tx.hash.toHexString()
  transactionEntity.account = account
  transactionEntity.type = LP_TRANSACTION_TYPE_WITHDRAWAL.toString()
  transactionEntity.nft = liquidityPoolNftEntity.id
  transactionEntity.rawAmount = amount
  transactionEntity.amount = toDecimal(amount, liquidityPoolContractEntity.tokenDecimals)
  transactionEntity.blockNumber = block.number
  transactionEntity.blockTimestamp = block.timestamp
  transactionEntity.liquidityPool = liquidityPoolContractEntity.id

  transactionEntity.save()

  return transactionEntity
}

export function transferLiquidity(liquidityPoolAddress: string, leaf: BigInt, to: string): LiquidityPoolNft | null {
  const liquidityPoolNftEntityId = getLiquidityPoolNftEntityId(liquidityPoolAddress, leaf.toString())
  const liquidityPoolNftEntity = LiquidityPoolNft.load(liquidityPoolNftEntityId)

  // TODO remove later
  if (!liquidityPoolNftEntity) {
    log.error('transferLiquidity liquidityPoolNftEntity not found. liquidityPoolNftEntityId = {}', [
      liquidityPoolNftEntityId,
    ])

    return null
  }

  liquidityPoolNftEntity.owner = to

  if (Address.fromString(to).notEqual(Address.zero())) {
    liquidityPoolNftEntity.historicalOwners = addUniqueItem(liquidityPoolNftEntity.historicalOwners, to)
  }

  liquidityPoolNftEntity.save()

  return liquidityPoolNftEntity
}

export function changeWithdrawalTimeout(
  liquidityPoolAddress: string,
  newWithdrawTimeout: BigInt,
): LiquidityPoolContract | null {
  const liquidityPoolContractEntity = LiquidityPoolContract.load(liquidityPoolAddress)

  // TODO remove later
  if (!liquidityPoolContractEntity) {
    log.error('changeWithdrawalTimeout liquidityPoolContractEntity not found. liquidityPoolAddress = {}', [
      liquidityPoolAddress,
    ])

    return null
  }

  liquidityPoolContractEntity.withdrawTimeout = newWithdrawTimeout
  liquidityPoolContractEntity.save()

  return liquidityPoolContractEntity
}

export function countConditionResolved(
  liquidityPoolAddress: string,
  betsAmount: BigInt,
  wonBetsAmount: BigInt,
  block: ethereum.Block,
): LiquidityPoolContract | null {
  const liquidityPoolContractEntity = LiquidityPoolContract.load(liquidityPoolAddress)

  // TODO remove later
  if (!liquidityPoolContractEntity) {
    log.error('countConditionResolved liquidityPoolContractEntity not found. liquidityPoolAddress = {}', [
      liquidityPoolAddress,
    ])

    return null
  }

  liquidityPoolContractEntity.betsAmount = liquidityPoolContractEntity.betsAmount.plus(betsAmount)
  liquidityPoolContractEntity.betsCount = liquidityPoolContractEntity.betsCount.plus(BigInt.fromString('1'))

  liquidityPoolContractEntity.wonBetsAmount = liquidityPoolContractEntity.wonBetsAmount.plus(wonBetsAmount)
  liquidityPoolContractEntity.wonBetsCount = liquidityPoolContractEntity.wonBetsCount.plus(BigInt.fromString('1'))

  updatePoolOnCommonEvents(liquidityPoolContractEntity, block)

  liquidityPoolContractEntity.save()

  return liquidityPoolContractEntity
}

export function updateLiquidityManager(
  liquidityPoolAddress: string,
  liquidityManagerAddress: string | null,
): LiquidityPoolContract | null {
  const liquidityPoolContractEntity = LiquidityPoolContract.load(liquidityPoolAddress)

  if (!liquidityPoolContractEntity) {
    log.error('updateLiquidityManager liquidityPoolContractEntity not found. liquidityPoolAddress = {}', [
      liquidityPoolAddress,
    ])

    return null
  }

  liquidityPoolContractEntity.liquidityManager = liquidityManagerAddress

  liquidityPoolContractEntity.save()

  return liquidityPoolContractEntity
}
