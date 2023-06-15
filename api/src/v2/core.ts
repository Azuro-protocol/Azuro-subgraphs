import { log } from '@graphprotocol/graph-ts'

import {
  Condition, CoreContract, Game, LiquidityPoolContract, Outcome,
} from '../../generated/schema'
import {
  ConditionCreated,
  ConditionResolved,
  ConditionStopped,
  CoreV2 as Core,
  NewBet,
  OddsChanged,
} from '../../generated/templates/CoreV2/CoreV2'
import { createBet } from '../common/bets'
import { createCondition, pauseUnpauseCondition, resolveCondition, updateConditionOdds } from '../common/conditions'
import { createEvent } from '../common/events'
import { BET_TYPE_ORDINAR } from '../constants'
import { getConditionEntityId, getGameEntityId, getOutcomeEntityId } from '../utils/schema'


export function handleConditionCreated(event: ConditionCreated): void {
  createEvent(
    'ConditionCreated',
    event.address,
    event.transaction.hash.toHexString(),
    event.transaction.index,
    event.logIndex,
    event.block,
    'conditionId',
    event.params.conditionId.toString(),
  )

  const conditionId = event.params.conditionId
  const coreAddress = event.address.toHexString()

  const coreSC = Core.bind(event.address)
  const conditionData = coreSC.try_getCondition(conditionId)

  if (conditionData.reverted) {
    log.error('getCondition reverted. conditionId = {}', [conditionId.toString()])

    return
  }

  const liquidityPoolAddress = CoreContract.load(coreAddress)!.liquidityPool
  const gameEntityId = getGameEntityId(liquidityPoolAddress, event.params.gameId.toString())

  const gameEntity = Game.load(gameEntityId)

  // TODO remove later
  if (!gameEntity) {
    log.error('v2 ConditionCreated gameEntity not found. gameEntityId = {}', [gameEntityId])

    return
  }

  createCondition(
    true,
    coreAddress,
    conditionId,
    gameEntity.id,
    conditionData.value.margin,
    conditionData.value.reinforcement,
    conditionData.value.outcomes,
    conditionData.value.virtualFunds,
    gameEntity.provider,
    event.transaction.hash.toHexString(),
    event.block,
  )
}

export function handleConditionResolved(event: ConditionResolved): void {
  createEvent(
    'ConditionResolved',
    event.address,
    event.transaction.hash.toHexString(),
    event.transaction.index,
    event.logIndex,
    event.block,
    'conditionId',
    event.params.conditionId.toString(),
  )

  const conditionId = event.params.conditionId
  const coreAddress = event.address.toHexString()

  const conditionEntityId = getConditionEntityId(coreAddress, conditionId.toString())
  const conditionEntity = Condition.load(conditionEntityId)

  // TODO remove later
  if (!conditionEntity) {
    log.error('v2 handleConditionResolved conditionEntity not found. conditionEntityId = {}', [conditionEntityId])

    return
  }

  const liquidityPoolAddress = CoreContract.load(coreAddress)!.liquidityPool

  resolveCondition(
    liquidityPoolAddress,
    conditionEntity,
    event.params.outcomeWin,
    event.transaction.hash.toHexString(),
    event.block,
  )
}

export function handleConditionStopped(event: ConditionStopped): void {
  createEvent(
    'ConditionStopped',
    event.address,
    event.transaction.hash.toHexString(),
    event.transaction.index,
    event.logIndex,
    event.block,
    'conditionId',
    event.params.conditionId.toString(),
  )

  const conditionId = event.params.conditionId
  const coreAddress = event.address.toHexString()

  const conditionEntityId = getConditionEntityId(coreAddress, conditionId.toString())
  const conditionEntity = Condition.load(conditionEntityId)

  // TODO remove later
  if (!conditionEntity) {
    log.error('v2 handleConditionStopped conditionEntity not found. conditionEntityId = {}', [conditionEntityId])

    return
  }

  pauseUnpauseCondition(conditionEntity, event.params.flag, event.block)
}

export function handleNewBet(event: NewBet): void {
  createEvent(
    'NewBet',
    event.address,
    event.transaction.hash.toHexString(),
    event.transaction.index,
    event.logIndex,
    event.block,
    'betId',
    event.params.tokenId.toString(),
  )

  const conditionId = event.params.conditionId
  const coreAddress = event.address.toHexString()

  const conditionEntityId = getConditionEntityId(coreAddress, conditionId.toString())
  const conditionEntity = Condition.load(conditionEntityId)

  // TODO remove later
  if (!conditionEntity) {
    log.error('v2 handleNewBet conditionEntity not found. conditionEntityId = {}', [conditionEntityId])

    return
  }

  const lp = CoreContract.load(coreAddress)!.liquidityPool
  const liquidityPoolContractEntity = LiquidityPoolContract.load(lp)!

  const outcomeEntityId = getOutcomeEntityId(conditionEntity.id, event.params.outcomeId.toString())
  const outcomeEntity = Outcome.load(outcomeEntityId)!

  createBet(
    true,
    BET_TYPE_ORDINAR.toString(),
    [conditionEntity],
    [outcomeEntity],
    [event.params.odds],
    event.params.odds,
    conditionEntity.coreAddress,
    event.params.bettor,
    event.params.affiliate,
    event.params.tokenId,
    liquidityPoolContractEntity.tokenDecimals,
    event.params.amount,
    event.transaction.hash.toHexString(),
    event.block,
    event.params.funds,
  )
}

export function handleOddsChanged(event: OddsChanged): void {
  const conditionId = event.params.conditionId
  const coreAddress = event.address.toHexString()

  const coreSC = Core.bind(event.address)
  const conditionData = coreSC.try_getCondition(conditionId)

  if (conditionData.reverted) {
    log.error('getCondition reverted. conditionId = {}', [conditionId.toString()])

    return
  }

  const conditionEntityId = getConditionEntityId(coreAddress, conditionId.toString())
  const conditionEntity = Condition.load(conditionEntityId)

  // TODO remove later
  if (!conditionEntity) {
    log.error('v2 handleNewBet handleOddsChanged not found. conditionEntityId = {}', [conditionEntityId])

    return
  }

  updateConditionOdds(conditionEntity, conditionData.value.outcomes, conditionData.value.virtualFunds, event.block)
}
