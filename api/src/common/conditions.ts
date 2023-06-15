import {
  BigDecimal, BigInt, ByteArray, ethereum, log,
} from '@graphprotocol/graph-ts'

import {
  Bet, Condition, Country, Game, League, Outcome, Selection,
} from '../../generated/schema'
import {
  BET_RESULT_LOST,
  BET_RESULT_WON,
  BET_STATUS_CANCELED,
  BET_STATUS_RESOLVED,
  BET_TYPE_EXPRESS,
  BET_TYPE_ORDINAR,
  CONDITION_STATUS_CANCELED,
  CONDITION_STATUS_CREATED,
  CONDITION_STATUS_PAUSED,
  CONDITION_STATUS_RESOLVED,
  GAME_STATUS_CANCELED,
  GAME_STATUS_CREATED,
  GAME_STATUS_PAUSED,
  GAME_STATUS_RESOLVED,
  SELECTION_RESULT_LOST,
  SELECTION_RESULT_WON,
  V1_BASE,
  V2_BASE,
} from '../constants'
import { removeItem } from '../utils/array'
import { getOdds, toDecimal } from '../utils/math'
import { getConditionEntityId, getOutcomeEntityId, getSelectionEntityId } from '../utils/schema'
import { calcPayout } from './express'
import { countConditionResolved } from './pool'


export function createCondition(
  isV2: boolean,
  coreAddress: string,
  conditionId: BigInt,
  gameEntityId: string,
  margin: BigInt,
  reinforcement: BigInt,
  outcomes: BigInt[],
  funds: BigInt[],
  provider: BigInt,
  txHash: string,
  createBlock: ethereum.Block,
  startsAt: BigInt | null = null,
): Condition | null {
  const conditionEntityId = getConditionEntityId(coreAddress, conditionId.toString())
  const conditionEntity = new Condition(conditionEntityId)

  conditionEntity.core = coreAddress
  conditionEntity.coreAddress = coreAddress

  conditionEntity.conditionId = conditionId
  conditionEntity.game = gameEntityId

  conditionEntity.createdTxHash = txHash

  conditionEntity.createdBlockNumber = createBlock.number
  conditionEntity.createdBlockTimestamp = createBlock.timestamp

  conditionEntity.status = CONDITION_STATUS_CREATED.toString()
  conditionEntity.margin = margin
  conditionEntity.reinforcement = reinforcement
  conditionEntity.turnover = BigInt.zero()
  conditionEntity.provider = provider

  conditionEntity._updatedAt = createBlock.timestamp
  conditionEntity.save()

  let outcomeIds: BigInt[] = []

  for (let i = 0; i < outcomes.length; i++) {
    outcomeIds.push(outcomes[i])

    const outcomeId = outcomes[i].toString()

    const outcomeEntityId = getOutcomeEntityId(conditionEntityId, outcomeId)
    const outcomeEntity = new Outcome(outcomeEntityId)

    outcomeEntity.core = coreAddress
    outcomeEntity.outcomeId = outcomes[i]
    outcomeEntity.condition = conditionEntity.id
    outcomeEntity.sortOrder = i
    outcomeEntity.fund = funds[i]

    outcomeEntity.rawCurrentOdds = getOdds(isV2, funds[0], funds[1], BigInt.zero(), i, conditionEntity.margin)

    outcomeEntity._betsEntityIds = []
    outcomeEntity.currentOdds = toDecimal(outcomeEntity.rawCurrentOdds, isV2 ? V2_BASE : V1_BASE)
    outcomeEntity._updatedAt = createBlock.timestamp

    outcomeEntity.save()
  }

  conditionEntity.outcomesIds = outcomeIds

  if (startsAt) {
    conditionEntity.internalStartsAt = startsAt
  }

  conditionEntity._updatedAt = createBlock.timestamp
  conditionEntity.save()

  const gameEntity = Game.load(gameEntityId)!

  gameEntity._activeConditionsEntityIds = gameEntity._activeConditionsEntityIds!.concat([conditionEntityId])
  gameEntity.hasActiveConditions = true
  gameEntity.status = GAME_STATUS_CREATED.toString()

  gameEntity._updatedAt = createBlock.timestamp

  gameEntity.save()

  const leagueEntity = League.load(gameEntity.league)!

  if (!leagueEntity.activeGamesEntityIds!.includes(gameEntityId)) {
    leagueEntity.activeGamesEntityIds = leagueEntity.activeGamesEntityIds!.concat([gameEntityId])
    leagueEntity.hasActiveGames = true
    leagueEntity.save()

    const countryEntity = Country.load(leagueEntity.country)!

    if (!countryEntity.activeLeaguesEntityIds!.includes(leagueEntity.id)) {
      countryEntity.activeLeaguesEntityIds = countryEntity.activeLeaguesEntityIds!.concat([leagueEntity.id])
      countryEntity.hasActiveLeagues = true
      countryEntity.save()
    }
  }

  return conditionEntity
}

export function updateConditionOdds(
  conditionEntity: Condition,
  outcomes: BigInt[],
  funds: BigInt[],
  block: ethereum.Block,
): Condition | null {
  for (let i = 0; i < outcomes.length; i++) {
    const outcomeId = outcomes[i].toString()

    const outcomeEntityId = getOutcomeEntityId(conditionEntity.id, outcomeId)
    const outcomeEntity = Outcome.load(outcomeEntityId)

    // TODO remove later
    if (!outcomeEntity) {
      log.error('updateConditionOdds outcomeEntity not found. outcomeEntityId = {}', [outcomeEntityId])

      return null
    }

    outcomeEntity.fund = funds[i]

    outcomeEntity.rawCurrentOdds = getOdds(true, funds[0], funds[1], BigInt.zero(), i, conditionEntity.margin)

    outcomeEntity.currentOdds = toDecimal(outcomeEntity.rawCurrentOdds, V2_BASE)

    outcomeEntity._updatedAt = block.timestamp

    outcomeEntity.save()
  }

  return conditionEntity
}

export function pauseUnpauseCondition(
  conditionEntity: Condition,
  flag: boolean,
  block: ethereum.Block,
): Condition | null {
  if (flag) {
    conditionEntity.status = CONDITION_STATUS_PAUSED.toString()
  }
  else {
    conditionEntity.status = CONDITION_STATUS_CREATED.toString()
  }

  conditionEntity._updatedAt = block.timestamp
  conditionEntity.save()

  const gameEntity = Game.load(conditionEntity.game)!

  if (flag) {
    gameEntity._activeConditionsEntityIds = removeItem(gameEntity._activeConditionsEntityIds!, conditionEntity.id)
    gameEntity._pausedConditionsEntityIds = gameEntity._pausedConditionsEntityIds!.concat([conditionEntity.id])

    if (
      ByteArray.fromUTF8(gameEntity.status).equals(GAME_STATUS_CREATED)
      && gameEntity._activeConditionsEntityIds!.length === 0
    ) {
      gameEntity.hasActiveConditions = false
      gameEntity.status = GAME_STATUS_PAUSED.toString()
    }
  }
  else {
    gameEntity._activeConditionsEntityIds = gameEntity._activeConditionsEntityIds!.concat([conditionEntity.id])
    gameEntity._pausedConditionsEntityIds = removeItem(gameEntity._pausedConditionsEntityIds!, conditionEntity.id)

    if (
      ByteArray.fromUTF8(gameEntity.status).equals(GAME_STATUS_PAUSED)
      && gameEntity._pausedConditionsEntityIds!.length === 0
    ) {
      gameEntity.hasActiveConditions = true
      gameEntity.status = GAME_STATUS_CREATED.toString()
    }
  }

  gameEntity._updatedAt = block.timestamp

  gameEntity.save()

  return conditionEntity
}

export function resolveCondition(
  liquidityPoolAddress: string,
  conditionEntity: Condition,
  outcomeWin: BigInt,
  txHash: string,
  block: ethereum.Block,
): Condition | null {
  const isCanceled = outcomeWin.equals(BigInt.zero())

  let betsAmount = BigInt.zero()
  let wonBetsAmount = BigInt.zero()

  if (isCanceled) {
    conditionEntity.status = CONDITION_STATUS_CANCELED.toString()
  }
  else {
    const outcomeEntityId = getOutcomeEntityId(conditionEntity.id, outcomeWin.toString())
    conditionEntity.wonOutcome = Outcome.load(outcomeEntityId)!.id

    conditionEntity.wonOutcomeId = outcomeWin
    conditionEntity.status = CONDITION_STATUS_RESOLVED.toString()
  }

  conditionEntity.resolvedTxHash = txHash
  conditionEntity.resolvedBlockNumber = block.number
  conditionEntity.resolvedBlockTimestamp = block.timestamp

  conditionEntity._updatedAt = block.timestamp
  conditionEntity.save()

  // TODO remove later
  if (!conditionEntity.outcomesIds) {
    log.error('resolveCondition outcomesIds is empty.', [])

    return null
  }

  for (let i = 0; i < conditionEntity.outcomesIds!.length; i++) {
    const outcomeEntityId = getOutcomeEntityId(conditionEntity.id, conditionEntity.outcomesIds![i].toString())
    const outcomeEntity = Outcome.load(outcomeEntityId)!

    if (outcomeEntity._betsEntityIds!.length === 0) {
      continue
    }

    for (let j = 0; j < outcomeEntity._betsEntityIds!.length; j++) {
      const betEntityId = outcomeEntity._betsEntityIds![j]
      const betEntity = Bet.load(betEntityId)!

      betsAmount = betsAmount.plus(betEntity.rawAmount)

      const selectionEntityId = getSelectionEntityId(betEntityId, conditionEntity.conditionId.toString())
      const selectionEntity = Selection.load(selectionEntityId)!

      if (!isCanceled) {
        if (selectionEntity._outcomeId.equals(outcomeWin)) {
          betEntity._wonSubBetsCount += 1
          selectionEntity.result = SELECTION_RESULT_WON.toString()
        }
        else {
          betEntity._lostSubBetsCount += 1
          selectionEntity.result = SELECTION_RESULT_LOST.toString()
        }
      }
      else {
        betEntity._canceledSubBetsCount += 1
      }

      selectionEntity.save()

      // All subBets is resolved
      if (
        betEntity._wonSubBetsCount + betEntity._lostSubBetsCount + betEntity._canceledSubBetsCount
        === betEntity._subBetsCount
      ) {
        betEntity.resolvedBlockTimestamp = block.timestamp
        betEntity.resolvedBlockNumber = block.number
        betEntity.resolvedTxHash = txHash

        betEntity.rawSettledOdds = betEntity.rawOdds
        betEntity.settledOdds = betEntity.odds

        // At least one subBet is lost - customer lost
        if (betEntity._lostSubBetsCount > 0) {
          betEntity.result = BET_RESULT_LOST.toString()
          betEntity.status = BET_STATUS_RESOLVED.toString()
          betEntity.rawPayout = BigInt.zero()
          betEntity.payout = BigDecimal.zero()
        }
        // At least one subBet is won and no lost subBets - customer won
        else if (betEntity._wonSubBetsCount > 0) {
          betEntity.result = BET_RESULT_WON.toString()
          betEntity.status = BET_STATUS_RESOLVED.toString()
          betEntity.isRedeemable = true

          if (ByteArray.fromUTF8(betEntity.type).equals(BET_TYPE_ORDINAR)) {
            betEntity.rawPayout = betEntity.rawPotentialPayout
            betEntity.payout = betEntity.potentialPayout
          }
          else if (ByteArray.fromUTF8(betEntity.type).equals(BET_TYPE_EXPRESS)) {
            const payoutSC = calcPayout(betEntity.core, betEntity.betId)

            if (payoutSC !== null) {
              betEntity.rawPayout = payoutSC
              betEntity.payout = toDecimal(payoutSC, betEntity._tokenDecimals)

              betEntity.rawSettledOdds = payoutSC
                .times(BigInt.fromString('10').pow(betEntity._oddsDecimals as u8))
                .div(betEntity.rawAmount)

              betEntity.settledOdds = toDecimal(betEntity.rawSettledOdds!, betEntity._oddsDecimals)
            }
            else {
              betEntity.rawPayout = BigInt.zero()
              betEntity.payout = BigDecimal.zero()
            }
          }

          wonBetsAmount = wonBetsAmount.plus(betEntity.rawPayout!)
        }

        // Only canceled subBets - express was canceled
        else {
          betEntity.status = BET_STATUS_CANCELED.toString()
          betEntity.isRedeemable = true
          betEntity.rawPayout = betEntity.rawAmount
          betEntity.payout = betEntity.amount
        }
      }

      betEntity._updatedAt = block.timestamp
      betEntity.save()
    }
  }

  // determine game status
  // determine if game has active conditions
  // determine if league has active games
  // determine if sport has active leagues
  // calculate turnover

  const gameEntity = Game.load(conditionEntity.game)!
  const leagueEntity = League.load(gameEntity.league)!
  const countryEntity = Country.load(leagueEntity.country)!

  gameEntity._activeConditionsEntityIds = removeItem(gameEntity._activeConditionsEntityIds!, conditionEntity.id)

  if (isCanceled) {
    gameEntity._canceledConditionsEntityIds = gameEntity._canceledConditionsEntityIds!.concat([conditionEntity.id])
  }
  else {
    gameEntity._resolvedConditionsEntityIds = gameEntity._resolvedConditionsEntityIds!.concat([conditionEntity.id])
  }

  if (gameEntity.hasActiveConditions && gameEntity._activeConditionsEntityIds!.length === 0) {
    gameEntity.hasActiveConditions = false

    if (gameEntity._resolvedConditionsEntityIds!.length === 0 && gameEntity._canceledConditionsEntityIds!.length > 0) {
      gameEntity.status = GAME_STATUS_CANCELED.toString()
    }
    else {
      gameEntity.status = GAME_STATUS_RESOLVED.toString()
    }

    leagueEntity.activeGamesEntityIds = removeItem(leagueEntity.activeGamesEntityIds!, gameEntity.id)

    if (leagueEntity.hasActiveGames && leagueEntity.activeGamesEntityIds!.length === 0) {
      leagueEntity.hasActiveGames = false

      countryEntity.activeLeaguesEntityIds = removeItem(countryEntity.activeLeaguesEntityIds!, leagueEntity.id)

      if (countryEntity.hasActiveLeagues && countryEntity.activeLeaguesEntityIds!.length === 0) {
        countryEntity.hasActiveLeagues = false
      }
    }
  }

  gameEntity.turnover = gameEntity.turnover.minus(conditionEntity.turnover)
  leagueEntity.turnover = leagueEntity.turnover.minus(conditionEntity.turnover)
  countryEntity.turnover = countryEntity.turnover.minus(conditionEntity.turnover)

  gameEntity._updatedAt = block.timestamp

  gameEntity.save()
  leagueEntity.save()
  countryEntity.save()

  countConditionResolved(liquidityPoolAddress, betsAmount, wonBetsAmount, block)

  return conditionEntity
}
