import {
  Address,
  BigDecimal,
  BigInt,
  ByteArray,
  ethereum,
  log,
} from '@graphprotocol/graph-ts'

import {
  Bet,
  Condition,
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
  VERSION_V2,
  VERSION_V3,
} from '../constants'
import { removeItem } from '../utils/array'
import { getOdds, toDecimal } from '../utils/math'
import {
  getConditionEntityId,
  getOutcomeEntityId,
  getSelectionEntityId,
} from '../utils/schema'
import { createEvent } from './events'
import { calcPayoutV2, calcPayoutV3 } from './express'
import { countConditionResolved } from './pool'


export function createCondition(
  version: string,
  coreAddress: string,
  conditionId: BigInt,
  gameEntityId: string,
  margin: BigInt,
  reinforcement: BigInt,
  outcomes: BigInt[],
  funds: BigInt[],
  winningOutcomesCount: i32,
  isExpressForbidden: boolean,
  provider: BigInt,
  txHash: string,
  createBlock: ethereum.Block,
  startsAt: BigInt | null = null,
): Condition | null {
  const conditionEntityId = getConditionEntityId(
    coreAddress,
    conditionId.toString(),
  )
  const conditionEntity = new Condition(conditionEntityId)

  conditionEntity.core = coreAddress
  conditionEntity.coreAddress = coreAddress

  conditionEntity.conditionId = conditionId
  conditionEntity.game = gameEntityId
  conditionEntity._winningOutcomesCount = winningOutcomesCount

  conditionEntity.isExpressForbidden = isExpressForbidden

  conditionEntity.createdTxHash = txHash

  conditionEntity.createdBlockNumber = createBlock.number
  conditionEntity.createdBlockTimestamp = createBlock.timestamp

  conditionEntity.status = CONDITION_STATUS_CREATED.toString()
  conditionEntity.margin = margin
  conditionEntity.reinforcement = reinforcement
  conditionEntity.turnover = BigInt.zero()
  conditionEntity.provider = provider

  conditionEntity._updatedAt = createBlock.timestamp

  const newOdds = getOdds(
    version,
    funds,
    conditionEntity.margin,
    conditionEntity._winningOutcomesCount,
  )

  if (newOdds === null) {
    log.error('createCondition getOdds returned null, conditionId {}', [
      conditionId.toString(),
    ])

    return null
  }

  conditionEntity.save()

  let outcomeIds: BigInt[] = []

  for (let i = 0; i < outcomes.length; i++) {
    outcomeIds = outcomeIds.concat([outcomes[i]])

    const outcomeId = outcomes[i].toString()

    const outcomeEntityId = getOutcomeEntityId(conditionEntityId, outcomeId)
    const outcomeEntity = new Outcome(outcomeEntityId)

    outcomeEntity.core = coreAddress
    outcomeEntity.outcomeId = outcomes[i]
    outcomeEntity.condition = conditionEntity.id
    outcomeEntity.sortOrder = i
    outcomeEntity.fund = funds[i]
    outcomeEntity.rawCurrentOdds = newOdds[i]

    outcomeEntity._betsEntityIds = []
    outcomeEntity.currentOdds = toDecimal(
      outcomeEntity.rawCurrentOdds,
      BASES_VERSIONS.mustGetEntry(version).value,
    )
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
  version: string,
  conditionEntity: Condition,
  outcomesEntities: Outcome[],
  funds: BigInt[],
  block: ethereum.Block,
): Condition | null {
  const odds = getOdds(
    version,
    funds,
    conditionEntity.margin,
    conditionEntity._winningOutcomesCount,
  )

  if (odds === null) {
    return null
  }

  for (let i = 0; i < outcomesEntities.length; i++) {
    const outcomeEntity = outcomesEntities[i]

    outcomeEntity.fund = funds[i]
    outcomeEntity.rawCurrentOdds = odds[i]
    outcomeEntity.currentOdds = toDecimal(
      outcomeEntity.rawCurrentOdds,
      BASES_VERSIONS.mustGetEntry(version).value,
    )
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
    gameEntity._activeConditionsEntityIds = removeItem(
      gameEntity._activeConditionsEntityIds!,
      conditionEntity.id,
    )
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
    gameEntity._pausedConditionsEntityIds = removeItem(
      gameEntity._pausedConditionsEntityIds!,
      conditionEntity.id,
    )

    if (ByteArray.fromUTF8(gameEntity.status).equals(GAME_STATUS_PAUSED)) {
      gameEntity.hasActiveConditions = true
      gameEntity.status = GAME_STATUS_CREATED.toString()
    }
  }

  gameEntity._updatedAt = block.timestamp

  gameEntity.save()

  return conditionEntity
}

export function resolveCondition(
  version: string,
  liquidityPoolAddress: string,
  conditionEntity: Condition,
  winningOutcomes: BigInt[],
  event: ethereum.Event,
): Condition | null {
  const isCanceled = winningOutcomes.length === 0 || winningOutcomes[0].equals(BigInt.zero())

  let betsAmount = BigInt.zero()
  let wonBetsAmount = BigInt.zero()

  if (isCanceled) {
    conditionEntity.status = CONDITION_STATUS_CANCELED.toString()
  }
  else {
    let wonOutcomes: string[] = []

    for (let i = 0; i < winningOutcomes.length; i++) {
      const outcomeEntityId = getOutcomeEntityId(
        conditionEntity.id,
        winningOutcomes[i].toString(),
      )
      const outcomeEntity = Outcome.load(outcomeEntityId)!.id

      wonOutcomes = wonOutcomes.concat([outcomeEntity])
    }

    conditionEntity.wonOutcomes = wonOutcomes
    conditionEntity.wonOutcomeIds = winningOutcomes
    conditionEntity.status = CONDITION_STATUS_RESOLVED.toString()
  }

  conditionEntity.resolvedTxHash = event.transaction.hash.toHexString()
  conditionEntity.resolvedBlockNumber = event.block.number
  conditionEntity.resolvedBlockTimestamp = event.block.timestamp

  conditionEntity._updatedAt = event.block.timestamp
  conditionEntity.save()

  // TODO remove later
  if (!conditionEntity.outcomesIds) {
    log.error('resolveCondition outcomesIds is empty.', [])

    return null
  }

  for (let i = 0; i < conditionEntity.outcomesIds!.length; i++) {
    const outcomeEntityId = getOutcomeEntityId(
      conditionEntity.id,
      conditionEntity.outcomesIds![i].toString(),
    )
    const outcomeEntity = Outcome.load(outcomeEntityId)!

    if (outcomeEntity._betsEntityIds!.length === 0) {
      continue
    }

    for (let j = 0; j < outcomeEntity._betsEntityIds!.length; j++) {
      const betEntityId = outcomeEntity._betsEntityIds![j]
      const betEntity = Bet.load(betEntityId)!

      betsAmount = betsAmount.plus(betEntity.rawAmount)

      const selectionEntityId = getSelectionEntityId(
        betEntityId,
        conditionEntity.conditionId.toString(),
      )
      const selectionEntity = Selection.load(selectionEntityId)!

      if (!isCanceled) {
        if (winningOutcomes.indexOf(selectionEntity._outcomeId) !== -1) {
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
        betEntity._wonSubBetsCount
          + betEntity._lostSubBetsCount
          + betEntity._canceledSubBetsCount
        === betEntity._subBetsCount
      ) {
        createEvent(
          'BetSettled',
          Address.fromString(betEntity.core),
          event.transaction.hash.toHexString(),
          event.transaction.index,
          event.logIndex,
          event.block,
          event.transaction.gasPrice,
          event.receipt !== null ? event.receipt!.gasUsed : null,
          'betId',
          betEntity.betId.toString(),
        )

        betEntity.resolvedBlockTimestamp = event.block.timestamp
        betEntity.resolvedBlockNumber = event.block.number
        betEntity.resolvedTxHash = event.transaction.hash.toHexString()

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
          else if (
            ByteArray.fromUTF8(betEntity.type).equals(BET_TYPE_EXPRESS)
          ) {
            let payoutSC: BigInt | null = null

            if (version === VERSION_V2) {
              payoutSC = calcPayoutV2(betEntity.core, betEntity.betId)
            }
            else if (version === VERSION_V3) {
              payoutSC = calcPayoutV3(betEntity.core, betEntity.betId)
            }

            if (payoutSC !== null) {
              betEntity.rawPayout = payoutSC
              betEntity.payout = toDecimal(payoutSC, betEntity._tokenDecimals)

              betEntity.rawSettledOdds = payoutSC
                .times(
                  BigInt.fromString('10').pow(betEntity._oddsDecimals as u8),
                )
                .div(betEntity.rawAmount)

              betEntity.settledOdds = toDecimal(
                betEntity.rawSettledOdds!,
                betEntity._oddsDecimals,
              )
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

      betEntity._updatedAt = event.block.timestamp
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

  gameEntity._activeConditionsEntityIds = removeItem(
    gameEntity._activeConditionsEntityIds!,
    conditionEntity.id,
  )
  gameEntity._pausedConditionsEntityIds = removeItem(
    gameEntity._pausedConditionsEntityIds!,
    conditionEntity.id,
  )

  if (isCanceled) {
    gameEntity._canceledConditionsEntityIds = gameEntity._canceledConditionsEntityIds!.concat([conditionEntity.id])
  }
  else {
    gameEntity._resolvedConditionsEntityIds = gameEntity._resolvedConditionsEntityIds!.concat([conditionEntity.id])
  }

  if (gameEntity._activeConditionsEntityIds!.length === 0) {
    if (gameEntity.hasActiveConditions) {
      gameEntity.hasActiveConditions = false
    }

    if (
      gameEntity._resolvedConditionsEntityIds!.length === 0
      && gameEntity._pausedConditionsEntityIds!.length === 0
      && gameEntity._canceledConditionsEntityIds!.length > 0
    ) {
      gameEntity.status = GAME_STATUS_CANCELED.toString()
    }
    else if (
      gameEntity._resolvedConditionsEntityIds!.length > 0
      && gameEntity._pausedConditionsEntityIds!.length === 0
    ) {
      gameEntity.status = GAME_STATUS_RESOLVED.toString()
    }

    leagueEntity.activeGamesEntityIds = removeItem(
      leagueEntity.activeGamesEntityIds!,
      gameEntity.id,
    )

    if (
      leagueEntity.hasActiveGames
      && leagueEntity.activeGamesEntityIds!.length === 0
    ) {
      leagueEntity.hasActiveGames = false

      countryEntity.activeLeaguesEntityIds = removeItem(
        countryEntity.activeLeaguesEntityIds!,
        leagueEntity.id,
      )

      if (
        countryEntity.hasActiveLeagues
        && countryEntity.activeLeaguesEntityIds!.length === 0
      ) {
        countryEntity.hasActiveLeagues = false
      }
    }
  }

  gameEntity.turnover = gameEntity.turnover.minus(conditionEntity.turnover)
  leagueEntity.turnover = leagueEntity.turnover.minus(conditionEntity.turnover)
  countryEntity.turnover = countryEntity.turnover.minus(
    conditionEntity.turnover,
  )

  gameEntity._updatedAt = event.block.timestamp

  gameEntity.save()
  leagueEntity.save()
  countryEntity.save()

  countConditionResolved(
    liquidityPoolAddress,
    betsAmount,
    wonBetsAmount,
    event.block,
  )

  return conditionEntity
}

export function resolveLiveCondition(
  liveConditionEntity: LiveCondition,
  winningOutcomes: BigInt[],
  event: ethereum.Event,
): LiveCondition | null {
  const isCanceled = winningOutcomes.length === 0 || winningOutcomes[0].equals(BigInt.zero())

  let betsAmount = BigInt.zero()
  let wonBetsAmount = BigInt.zero()

  if (isCanceled) {
    liveConditionEntity.status = CONDITION_STATUS_CANCELED.toString()
  }
  else {
    let wonOutcomes: string[] = []

    for (let i = 0; i < winningOutcomes.length; i++) {
      const liveOutcomeEntityId = getOutcomeEntityId(
        liveConditionEntity.id,
        winningOutcomes[i].toString(),
      )
      const liveOutcomeEntity = LiveOutcome.load(liveOutcomeEntityId)!.id

      wonOutcomes = wonOutcomes.concat([liveOutcomeEntity])
    }

    liveConditionEntity.wonOutcomes = wonOutcomes
    liveConditionEntity.wonOutcomeIds = winningOutcomes
    liveConditionEntity.status = CONDITION_STATUS_RESOLVED.toString()
  }

  liveConditionEntity.resolvedTxHash = event.transaction.hash.toHexString()
  liveConditionEntity.resolvedBlockNumber = event.block.number
  liveConditionEntity.resolvedBlockTimestamp = event.block.timestamp

  liveConditionEntity._updatedAt = event.block.timestamp
  liveConditionEntity.save()

  // TODO remove later
  if (!liveConditionEntity.outcomesIds) {
    log.error('resolveCondition outcomesIds is empty.', [])

    return null
  }

  for (let i = 0; i < liveConditionEntity.outcomesIds!.length; i++) {
    const liveOutcomeEntityId = getOutcomeEntityId(
      liveConditionEntity.id,
      liveConditionEntity.outcomesIds![i].toString(),
    )
    const liveOutcomeEntity = LiveOutcome.load(liveOutcomeEntityId)!

    if (liveOutcomeEntity._betsEntityIds!.length === 0) {
      continue
    }

    for (let j = 0; j < liveOutcomeEntity._betsEntityIds!.length; j++) {
      const livebetEntityId = liveOutcomeEntity._betsEntityIds![j]
      const liveBetEntity = LiveBet.load(livebetEntityId)!

      betsAmount = betsAmount.plus(liveBetEntity.rawAmount)

      const liveSelectionEntityId = getSelectionEntityId(
        livebetEntityId,
        liveConditionEntity.conditionId.toString(),
      )
      const liveSelectionEntity = LiveSelection.load(liveSelectionEntityId)!

      if (!isCanceled) {
        if (winningOutcomes.indexOf(liveSelectionEntity._outcomeId) !== -1) {
          liveBetEntity._wonSubBetsCount += 1
          liveSelectionEntity.result = SELECTION_RESULT_WON.toString()
        }
        else {
          liveBetEntity._lostSubBetsCount += 1
          liveSelectionEntity.result = SELECTION_RESULT_LOST.toString()
        }
      }
      else {
        liveBetEntity._canceledSubBetsCount += 1
      }

      liveSelectionEntity.save()

      // All subBets is resolved
      if (
        liveBetEntity._wonSubBetsCount
          + liveBetEntity._lostSubBetsCount
          + liveBetEntity._canceledSubBetsCount
        === liveBetEntity._subBetsCount
      ) {
        createEvent(
          'BetSettled',
          Address.fromString(liveBetEntity.core),
          event.transaction.hash.toHexString(),
          event.transaction.index,
          event.logIndex,
          event.block,
          event.transaction.gasPrice,
          event.receipt !== null ? event.receipt!.gasUsed : null,
          'betId',
          liveBetEntity.betId.toString(),
        )

        liveBetEntity.resolvedBlockTimestamp = event.block.timestamp
        liveBetEntity.resolvedBlockNumber = event.block.number
        liveBetEntity.resolvedTxHash = event.transaction.hash.toHexString()

        liveBetEntity.rawSettledOdds = liveBetEntity.rawOdds
        liveBetEntity.settledOdds = liveBetEntity.odds

        // At least one subBet is lost - customer lost
        if (liveBetEntity._lostSubBetsCount > 0) {
          liveBetEntity.result = BET_RESULT_LOST.toString()
          liveBetEntity.status = BET_STATUS_RESOLVED.toString()
          liveBetEntity.rawPayout = BigInt.zero()
          liveBetEntity.payout = BigDecimal.zero()
        }
        // At least one subBet is won and no lost subBets - customer won
        else if (liveBetEntity._wonSubBetsCount > 0) {
          liveBetEntity.result = BET_RESULT_WON.toString()
          liveBetEntity.status = BET_STATUS_RESOLVED.toString()
          liveBetEntity.isRedeemable = true

          liveBetEntity.rawPayout = liveBetEntity.rawPotentialPayout
          liveBetEntity.payout = liveBetEntity.potentialPayout
          wonBetsAmount = wonBetsAmount.plus(liveBetEntity.rawPayout!)
        }

        // Only canceled subBets - express was canceled
        else {
          liveBetEntity.status = BET_STATUS_CANCELED.toString()
          liveBetEntity.isRedeemable = true
          liveBetEntity.rawPayout = liveBetEntity.rawAmount
          liveBetEntity.payout = liveBetEntity.amount
        }
      }

      liveBetEntity._updatedAt = event.block.timestamp
      liveBetEntity.save()
    }
  }

  return liveConditionEntity
}

export function createLiveCondition(
  coreAddress: string,
  liveConditionId: BigInt,
  gameId: BigInt,
  liveOutcomes: BigInt[],
  winningOutcomesCount: i32,
  txHash: string,
  createBlock: ethereum.Block,
): LiveCondition | null {
  const liveConditionEntityId = getConditionEntityId(
    coreAddress,
    liveConditionId.toString(),
  )
  const liveConditionEntity = new LiveCondition(liveConditionEntityId)

  liveConditionEntity.core = coreAddress
  liveConditionEntity.coreAddress = coreAddress

  liveConditionEntity.conditionId = liveConditionId
  liveConditionEntity.gameId = gameId
  liveConditionEntity._winningOutcomesCount = winningOutcomesCount

  liveConditionEntity.createdTxHash = txHash

  liveConditionEntity.createdBlockNumber = createBlock.number
  liveConditionEntity.createdBlockTimestamp = createBlock.timestamp

  liveConditionEntity.status = CONDITION_STATUS_CREATED.toString()
  liveConditionEntity.turnover = BigInt.zero()

  liveConditionEntity._updatedAt = createBlock.timestamp

  liveConditionEntity.save()

  let liveOutcomeIds: BigInt[] = []

  for (let i = 0; i < liveOutcomes.length; i++) {
    liveOutcomeIds = liveOutcomeIds.concat([liveOutcomes[i]])

    const liveOutcomeId = liveOutcomes[i].toString()

    const liveOutcomeEntityId = getOutcomeEntityId(
      liveConditionEntityId,
      liveOutcomeId,
    )

    const liveOutcomeEntity = new LiveOutcome(liveOutcomeEntityId)

    liveOutcomeEntity.core = coreAddress
    liveOutcomeEntity.outcomeId = liveOutcomes[i]
    liveOutcomeEntity.condition = liveConditionEntity.id
    liveOutcomeEntity.sortOrder = i

    liveOutcomeEntity._betsEntityIds = []
    liveOutcomeEntity._updatedAt = createBlock.timestamp

    liveOutcomeEntity.save()
  }

  liveConditionEntity.outcomesIds = liveOutcomeIds

  liveConditionEntity._updatedAt = createBlock.timestamp
  liveConditionEntity.save()

  return liveConditionEntity
}

export function updateConditionMargin(
  conditionEntity: Condition,
  newMargin: BigInt,
  block: ethereum.Block,
): Condition | null {
  conditionEntity.margin = newMargin
  conditionEntity._updatedAt = block.timestamp
  conditionEntity.save()

  return conditionEntity
}

export function updateConditionReinforcement(
  conditionEntity: Condition,
  newReinforcement: BigInt,
  block: ethereum.Block,
): Condition | null {
  conditionEntity.reinforcement = newReinforcement
  conditionEntity._updatedAt = block.timestamp
  conditionEntity.save()

  return conditionEntity
}
