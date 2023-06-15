import {
  Address, BigInt, ByteArray, ethereum, log,
} from '@graphprotocol/graph-ts'

import {
  AzuroBetContract, Bet, Condition, Country, Game, League, Outcome, Selection,
} from '../../generated/schema'
import {
  BET_STATUS_ACCEPTED, BET_TYPE_ORDINAR, C1e9, C1e12, V1_BASE, V2_BASE,
} from '../constants'
import { getOdds, toDecimal } from '../utils/math'
import { getBetEntityId, getOutcomeEntityId, getSelectionEntityId } from '../utils/schema'


export function createBet(
  isV2: boolean,
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

  const potentialPayout = amount.times(odds).div(isV2 ? C1e12 : C1e9)

  const betEntityId = getBetEntityId(coreAddress, tokenId.toString())
  const betEntity = new Bet(betEntityId)

  betEntity.type = betType
  betEntity._subBetsCount = betOutcomeEntities.length as u8
  betEntity._wonSubBetsCount = 0
  betEntity._lostSubBetsCount = 0
  betEntity._canceledSubBetsCount = 0

  betEntity.rawOdds = odds
  betEntity.odds = toDecimal(betEntity.rawOdds, isV2 ? V2_BASE : V1_BASE)
  betEntity._oddsDecimals = isV2 ? V2_BASE : V1_BASE

  for (let k = 0; k < conditionEntities.length; k++) {
    const conditionEntity = conditionEntities[k]
    const outcomeEntities: Outcome[] = []

    // double-check of sorting by sortOrder field
    for (let j = 0; j < conditionEntity.outcomesIds!.length; j++) {
      const outcomeId = conditionEntity.outcomesIds![j]

      const outcomeEntityId = getOutcomeEntityId(conditionEntity.id, outcomeId.toString())
      const outcomeEntity = Outcome.load(outcomeEntityId)!

      outcomeEntities[outcomeEntity.sortOrder] = outcomeEntity
    }

    for (let i = 0; i < outcomeEntities.length; i++) {
      const outcomeEntity = outcomeEntities[i]

      if (outcomeEntity.outcomeId.equals(betOutcomeEntities[k].outcomeId)) {
        outcomeEntity._betsEntityIds = outcomeEntity._betsEntityIds!.concat([betEntityId])
      }

      // odds the condition outcomes must be recalculated after the odrinar bet placed
      // express bet will fire ChangeOdds event
      if (ByteArray.fromUTF8(betType).equals(BET_TYPE_ORDINAR) && funds !== null) {
        outcomeEntity.fund = funds[i]
        outcomeEntity.rawCurrentOdds = getOdds(isV2, funds[0], funds[1], BigInt.zero(), i, conditionEntity.margin)

        outcomeEntity.currentOdds = toDecimal(outcomeEntity.rawCurrentOdds, isV2 ? V2_BASE : V1_BASE)
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
  betEntity.potentialPayout = toDecimal(betEntity.rawPotentialPayout, tokenDecimals)

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

    const selectionEntityId = getSelectionEntityId(betEntityId, conditionEntities[i].conditionId.toString())
    const selectionEntity = new Selection(selectionEntityId)

    selectionEntity.rawOdds = conditionOdds[i]
    selectionEntity.odds = toDecimal(selectionEntity.rawOdds, betEntity._oddsDecimals)

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
  const betEntity = Bet.load(betEntityId)

  // TODO remove later
  if (!betEntity) {
    log.error('bettorWin betEntity not found. betEntityId = {}', [betEntityId])

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
      log.error('transferBet azuroBetContractEntity not found. azuroBetAddress = {}', [azuroBetAddress])

      return null
    }

    finalCoreAddress = azuroBetContractEntity.core
  }

  const betEntityId = getBetEntityId(finalCoreAddress, tokenId.toString())
  const betEntity = Bet.load(betEntityId)

  // TODO remove later
  if (!betEntity) {
    log.error('transferBet betEntity not found. betEntityId = {}', [betEntityId])

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
