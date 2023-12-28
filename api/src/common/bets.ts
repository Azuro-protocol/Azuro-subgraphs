import {
  Address,
  BigInt,
  ByteArray,
  ethereum,
  log,
} from '@graphprotocol/graph-ts'

import {
  AzuroBetContract,
  Bet,
  Condition,
  CoreContract,
  Country,
  Game,
  League,
  LiveBet,
  LiveCondition,
  LiveOutcome,
  LiveSelection,
  Outcome,
  Selection,
} from '../../generated/schema'
import {
  BASES_VERSIONS,
  BET_STATUS_ACCEPTED,
  BET_TYPE_ORDINAR,
  CORE_TYPE_LIVE,
  MULTIPLIERS_VERSIONS,
} from '../constants'
import { getOdds, toDecimal } from '../utils/math'
import {
  getBetEntityId,
  getOutcomeEntityId,
  getSelectionEntityId,
} from '../utils/schema'


export function createBet(
  version: string,
  betType: string,
  conditionEntities: Condition[],
  betOutcomeEntities: Outcome[],
  conditionOdds: BigInt[],
  odds: BigInt,
  coreAddress: string,
  bettor: Address,
  affiliate: Address | null,
  tokenId: BigInt,
  tokenDecimals: i32,
  amount: BigInt,
  txHash: string,
  createdBlock: ethereum.Block,
  funds: BigInt[] | null,
): Bet | null {
  let conditionIds: BigInt[] = []
  let conditionEntitiesIds: string[] = []
  let gameEntitiesIds: string[] = []

  let approxSettledAt = BigInt.zero()

  for (let i = 0; i < conditionEntities.length; i++) {
    conditionIds[i] = conditionEntities[i].conditionId
    conditionEntitiesIds[i] = conditionEntities[i].id
    gameEntitiesIds[i] = conditionEntities[i].game

    const gameEntity = Game.load(gameEntitiesIds[i])!

    if (gameEntity.startsAt > approxSettledAt) {
      approxSettledAt = gameEntity.startsAt.plus(BigInt.fromI32(7200))
    }
  }

  // update outcomes, condition and game turnover for ordinar bets
  if (ByteArray.fromUTF8(betType).equals(BET_TYPE_ORDINAR)) {
    conditionEntities[0].turnover = conditionEntities[0].turnover.plus(amount)
    conditionEntities[0]._updatedAt = createdBlock.timestamp
    conditionEntities[0].save()

    const gameEntity = Game.load(conditionEntities[0].game)!
    gameEntity.turnover = gameEntity.turnover.plus(amount)
    gameEntity._updatedAt = createdBlock.timestamp
    gameEntity.save()

    const leagueEntity = League.load(gameEntity.league)!
    leagueEntity.turnover = leagueEntity.turnover.plus(amount)
    leagueEntity.save()

    const countryEntity = Country.load(leagueEntity.country)!
    countryEntity.turnover = countryEntity.turnover.plus(amount)
    countryEntity.save()
  }

  const potentialPayout = amount
    .times(odds)
    .div(MULTIPLIERS_VERSIONS.get(version)!)

  const betEntityId = getBetEntityId(coreAddress, tokenId.toString())
  const betEntity = new Bet(betEntityId)

  betEntity.type = betType
  betEntity._subBetsCount = betOutcomeEntities.length as u8
  betEntity._wonSubBetsCount = 0
  betEntity._lostSubBetsCount = 0
  betEntity._canceledSubBetsCount = 0

  betEntity.rawOdds = odds
  betEntity.odds = toDecimal(
    betEntity.rawOdds,
    BASES_VERSIONS.mustGetEntry(version).value,
  )
  betEntity._oddsDecimals = BASES_VERSIONS.mustGetEntry(version).value

  for (let k = 0; k < conditionEntities.length; k++) {
    const conditionEntity = conditionEntities[k]
    const outcomeEntities: Outcome[] = []

    // double-check of sorting by sortOrder field
    for (let j = 0; j < conditionEntity.outcomesIds!.length; j++) {
      const outcomeId = conditionEntity.outcomesIds![j]

      const outcomeEntityId = getOutcomeEntityId(
        conditionEntity.id,
        outcomeId.toString(),
      )
      const outcomeEntity = Outcome.load(outcomeEntityId)!

      outcomeEntities[outcomeEntity.sortOrder] = outcomeEntity
    }

    let newOdds: BigInt[] | null = null

    if (funds !== null) {
      newOdds = getOdds(
        version,
        funds,
        conditionEntity.margin,
        conditionEntity._winningOutcomesCount,
      )
    }

    for (let i = 0; i < outcomeEntities.length; i++) {
      const outcomeEntity = outcomeEntities[i]

      if (outcomeEntity.outcomeId.equals(betOutcomeEntities[k].outcomeId)) {
        outcomeEntity._betsEntityIds = outcomeEntity._betsEntityIds!.concat([
          betEntityId,
        ])
      }

      // odds the condition outcomes must be recalculated after the odrinar bet placed
      // express bet will fire ChangeOdds event
      if (
        ByteArray.fromUTF8(betType).equals(BET_TYPE_ORDINAR)
        && funds !== null
      ) {
        outcomeEntity.fund = funds[i]

        if (newOdds !== null) {
          outcomeEntity.rawCurrentOdds = newOdds[i]
        }

        outcomeEntity.currentOdds = toDecimal(
          outcomeEntity.rawCurrentOdds,
          BASES_VERSIONS.mustGetEntry(version).value,
        )
      }

      outcomeEntity._updatedAt = createdBlock.timestamp
      outcomeEntity.save()
    }
  }

  betEntity._conditions = conditionEntitiesIds
  betEntity._games = gameEntitiesIds

  // TODO: fix game shifted
  betEntity.approxSettledAt = approxSettledAt

  betEntity.betId = tokenId
  betEntity.core = coreAddress
  betEntity.bettor = bettor.toHexString()
  betEntity.owner = bettor.toHexString()
  betEntity.actor = bettor.toHexString()
  betEntity.affiliate = affiliate ? affiliate.toHexString() : null
  betEntity.rawAmount = amount
  betEntity.amount = toDecimal(betEntity.rawAmount, tokenDecimals)
  betEntity._tokenDecimals = tokenDecimals
  betEntity._conditionIds = conditionIds

  betEntity.rawPotentialPayout = potentialPayout
  betEntity.potentialPayout = toDecimal(
    betEntity.rawPotentialPayout,
    tokenDecimals,
  )

  betEntity.createdTxHash = txHash

  betEntity.createdBlockNumber = createdBlock.number
  betEntity.createdBlockTimestamp = createdBlock.timestamp

  betEntity.status = BET_STATUS_ACCEPTED.toString()
  betEntity.isRedeemed = false
  betEntity.isRedeemable = false

  betEntity._isFreebet = false
  betEntity._updatedAt = createdBlock.timestamp

  betEntity.save()

  for (let i = 0; i < betOutcomeEntities.length; i++) {
    const betOutcomeEntity = betOutcomeEntities[i]

    const selectionEntityId = getSelectionEntityId(
      betEntityId,
      conditionEntities[i].conditionId.toString(),
    )
    const selectionEntity = new Selection(selectionEntityId)

    selectionEntity.rawOdds = conditionOdds[i]
    selectionEntity.odds = toDecimal(
      selectionEntity.rawOdds,
      betEntity._oddsDecimals,
    )

    selectionEntity._oddsDecimals = betEntity._oddsDecimals
    selectionEntity.outcome = betOutcomeEntity.id
    selectionEntity._outcomeId = betOutcomeEntity.outcomeId
    selectionEntity.bet = betEntity.id
    selectionEntity.save()
  }

  return betEntity
}

export function bettorWin(
  coreAddress: string,
  tokenId: BigInt,
  amount: BigInt,
  txHash: string,
  block: ethereum.Block,
): void {
  const betEntityId = getBetEntityId(coreAddress, tokenId.toString())

  const coreContractEntity = CoreContract.load(coreAddress)

  if (!coreContractEntity) {
    log.error('coreContractEntity not found. coreContractEntityId = {}', [
      coreAddress,
    ])

    return
  }

  if (
    ByteArray.fromUTF8(coreContractEntity.type).equals(
      ByteArray.fromUTF8(CORE_TYPE_LIVE),
    )
  ) {
    const liveBetEntity = LiveBet.load(betEntityId)

    if (!liveBetEntity) {
      log.error('bettorWin liveBetEntity not found. betEntityId = {}', [
        betEntityId,
      ])

      return
    }

    liveBetEntity.isRedeemed = true
    liveBetEntity.isRedeemable = false
    liveBetEntity.rawPayout = amount
    liveBetEntity.payout = toDecimal(amount, liveBetEntity._tokenDecimals)

    liveBetEntity.redeemedBlockNumber = block.number
    liveBetEntity.redeemedBlockTimestamp = block.timestamp
    liveBetEntity.redeemedTxHash = txHash

    liveBetEntity._updatedAt = block.timestamp

    liveBetEntity.save()
  }
  else {
    const betEntity = Bet.load(betEntityId)

    // TODO remove later
    if (!betEntity) {
      log.error('bettorWin betEntity not found. betEntityId = {}', [
        betEntityId,
      ])

      return
    }

    betEntity.isRedeemed = true
    betEntity.isRedeemable = false
    betEntity.rawPayout = amount
    betEntity.payout = toDecimal(amount, betEntity._tokenDecimals)

    betEntity.redeemedBlockNumber = block.number
    betEntity.redeemedBlockTimestamp = block.timestamp
    betEntity.redeemedTxHash = txHash

    betEntity._updatedAt = block.timestamp

    betEntity.save()
  }
}

export function transferBet(
  coreAddress: string | null,
  azuroBetAddress: string | null,
  tokenId: BigInt,
  from: Address,
  to: Address,
  block: ethereum.Block,
): Bet | null {
  // create nft
  if (from.equals(Address.zero())) {
    return null
  }

  // burn nft
  if (to.equals(Address.zero())) {
    return null
  }

  let finalCoreAddress = ''

  if (coreAddress !== null) {
    finalCoreAddress = coreAddress
  }
  else if (azuroBetAddress !== null) {
    const azuroBetContractEntity = AzuroBetContract.load(azuroBetAddress)

    // TODO remove later
    if (!azuroBetContractEntity) {
      log.error(
        'transferBet azuroBetContractEntity not found. azuroBetAddress = {}',
        [azuroBetAddress],
      )

      return null
    }

    finalCoreAddress = azuroBetContractEntity.core
  }

  const betEntityId = getBetEntityId(finalCoreAddress, tokenId.toString())
  const betEntity = Bet.load(betEntityId)

  // TODO remove later
  if (!betEntity) {
    log.error('transferBet betEntity not found. betEntityId = {}', [
      betEntityId,
    ])

    return null
  }

  betEntity.owner = to.toHexString()

  if (!betEntity._isFreebet) {
    betEntity.actor = to.toHexString()
  }

  betEntity._updatedAt = block.timestamp
  betEntity.save()

  return betEntity
}

export function linkBetWithFreeBet(
  coreAddress: string,
  tokenId: BigInt,
  freebetEntityId: string,
  freebetOwner: string,
  block: ethereum.Block,
): Bet | null {
  const betEntityId = getBetEntityId(coreAddress, tokenId.toString())
  const betEntity = Bet.load(betEntityId)

  if (!betEntity) {
    log.error('linkBetWithFreeBet betEntity not found. betEntity = {}', [
      betEntityId,
    ])

    return null
  }

  betEntity.freebet = freebetEntityId
  betEntity._isFreebet = true
  betEntity.bettor = freebetOwner
  betEntity.actor = freebetOwner
  betEntity._updatedAt = block.timestamp

  betEntity.save()

  return betEntity
}

export function createLiveBet(
  version: string,
  betType: string,
  liveConditionEntities: LiveCondition[],
  liveOutcomeEntities: LiveOutcome[],
  conditionOdds: BigInt[],
  odds: BigInt,
  coreAddress: string,
  bettor: Address,
  affiliate: Address | null,
  tokenId: BigInt,
  tokenDecimals: i32,
  amount: BigInt,
  payoutLimit: BigInt,
  txHash: string,
  createdBlock: ethereum.Block,
): LiveBet | null {
  let conditionIds: BigInt[] = []
  let conditionEntitiesIds: string[] = []
  let gameIds: string[] = []

  for (let i = 0; i < liveConditionEntities.length; i++) {
    conditionIds[i] = liveConditionEntities[i].conditionId
    conditionEntitiesIds[i] = liveConditionEntities[i].id
    gameIds[i] = liveConditionEntities[i].gameId.toString()
  }

  // update outcomes, condition and game turnover for ordinar bets
  if (ByteArray.fromUTF8(betType).equals(BET_TYPE_ORDINAR)) {
    liveConditionEntities[0].turnover = liveConditionEntities[0].turnover.plus(amount)
    liveConditionEntities[0]._updatedAt = createdBlock.timestamp
    liveConditionEntities[0].save()
  }

  const potentialPayout = amount
    .times(odds)
    .div(MULTIPLIERS_VERSIONS.get(version)!)

  const liveBetEntityId = getBetEntityId(coreAddress, tokenId.toString())
  const liveBetEntity = new LiveBet(liveBetEntityId)

  liveBetEntity._subBetsCount = liveOutcomeEntities.length as u8
  liveBetEntity._wonSubBetsCount = 0
  liveBetEntity._lostSubBetsCount = 0
  liveBetEntity._canceledSubBetsCount = 0

  liveBetEntity.rawOdds = odds
  liveBetEntity.odds = toDecimal(odds, 12)

  liveBetEntity._oddsDecimals = BASES_VERSIONS.mustGetEntry(version).value

  for (let k = 0; k < liveConditionEntities.length; k++) {
    const liveConditionEntity = liveConditionEntities[k]
    const outcomeEntities: LiveOutcome[] = []

    // double-check of sorting by sortOrder field
    for (let j = 0; j < liveConditionEntity.outcomesIds!.length; j++) {
      const outcomeId = liveConditionEntity.outcomesIds![j]

      const outcomeEntityId = getOutcomeEntityId(
        liveConditionEntity.id,
        outcomeId.toString(),
      )
      const liveOutcomeEntity = LiveOutcome.load(outcomeEntityId)!

      outcomeEntities[liveOutcomeEntity.sortOrder] = liveOutcomeEntity
    }

    for (let i = 0; i < outcomeEntities.length; i++) {
      const liveOutcomeEntity = outcomeEntities[i]

      if (liveOutcomeEntity.outcomeId.equals(outcomeEntities[k].outcomeId)) {
        liveOutcomeEntity._betsEntityIds = liveOutcomeEntity._betsEntityIds!.concat([liveBetEntityId])
      }

      liveOutcomeEntity._updatedAt = createdBlock.timestamp
      liveOutcomeEntity.save()
    }
  }

  liveBetEntity._conditions = conditionEntitiesIds
  liveBetEntity._gamesIds = gameIds

  // TODO: fix game shifted
  liveBetEntity.betId = tokenId
  liveBetEntity.core = coreAddress
  liveBetEntity.bettor = bettor.toHexString()
  liveBetEntity.owner = bettor.toHexString()
  liveBetEntity.actor = bettor.toHexString()
  liveBetEntity.affiliate = affiliate ? affiliate.toHexString() : null
  liveBetEntity.rawAmount = amount
  liveBetEntity.amount = toDecimal(liveBetEntity.rawAmount, tokenDecimals)
  liveBetEntity._tokenDecimals = tokenDecimals
  liveBetEntity._conditionIds = conditionIds

  liveBetEntity.rawPotentialPayout = potentialPayout
  liveBetEntity.potentialPayout = toDecimal(potentialPayout, 12)

  liveBetEntity.rawPayoutLimit = payoutLimit
  liveBetEntity.payoutLimit = toDecimal(payoutLimit, 12)

  liveBetEntity.createdTxHash = txHash

  liveBetEntity.createdBlockNumber = createdBlock.number
  liveBetEntity.createdBlockTimestamp = createdBlock.timestamp

  liveBetEntity.status = BET_STATUS_ACCEPTED.toString()
  liveBetEntity.isRedeemed = false
  liveBetEntity.isRedeemable = false

  liveBetEntity._updatedAt = createdBlock.timestamp

  liveBetEntity.save()

  for (let i = 0; i < liveOutcomeEntities.length; i++) {
    const liveOutcomeEntity = liveOutcomeEntities[i]

    const liveSelectionEntityId = getSelectionEntityId(
      liveBetEntityId,
      liveConditionEntities[i].conditionId.toString(),
    )
    const liveSelectionEntity = new LiveSelection(liveSelectionEntityId)

    liveSelectionEntity.rawOdds = conditionOdds[i]
    liveSelectionEntity.odds = toDecimal(
      liveSelectionEntity.rawOdds,
      liveBetEntity._oddsDecimals,
    )

    liveSelectionEntity._oddsDecimals = liveBetEntity._oddsDecimals
    liveSelectionEntity.outcome = liveOutcomeEntity.id
    liveSelectionEntity._outcomeId = liveOutcomeEntity.outcomeId
    liveSelectionEntity.bet = liveBetEntity.id
    liveSelectionEntity.save()
  }

  return liveBetEntity
}
