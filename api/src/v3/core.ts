import { log } from '@graphprotocol/graph-ts'

import {
  Condition,
  CoreContract,
  Game,
  LiquidityPoolContract,
  Outcome,
} from '../../generated/schema'
import {
  ConditionCreated,
  ConditionResolved,
  ConditionStopped,
  CoreV3 as Core,
  MarginChanged,
  NewBet,
  OddsChanged,
  ReinforcementChanged,
} from '../../generated/templates/CoreV3/CoreV3'
import { createBet } from '../common/bets'
import {
  createCondition,
  pauseUnpauseCondition,
  resolveCondition,
  updateConditionMargin,
  updateConditionOdds,
  updateConditionReinforcement,
} from '../common/conditions'
import { createEvent } from '../common/events'
import { BET_TYPE_ORDINAR, VERSION_V3 } from '../constants'
import {
  getConditionEntityId,
  getGameEntityId,
  getOutcomeEntityId,
} from '../utils/schema'


export function handleConditionCreated(event: ConditionCreated): void {
  createEvent(
    'ConditionCreated',
    event.address,
    event.transaction.hash.toHexString(),
    event.transaction.index,
    event.logIndex,
    event.block,
    event.transaction.gasPrice,
    event.receipt !== null ? event.receipt!.gasUsed : null,
    'conditionId',
    event.params.conditionId.toString(),
  )

  const conditionId = event.params.conditionId
  const coreAddress = event.address.toHexString()

  const coreSC = Core.bind(event.address)
  const conditionData = coreSC.try_getCondition(conditionId)

  if (conditionData.reverted) {
    log.error('getCondition reverted. conditionId = {}', [
      conditionId.toString(),
    ])

    return
  }

  const liquidityPoolAddress = CoreContract.load(coreAddress)!.liquidityPool
  const gameEntityId = getGameEntityId(
    liquidityPoolAddress,
    event.params.gameId.toString(),
  )

  const gameEntity = Game.load(gameEntityId)

  // TODO remove later
  if (!gameEntity) {
    log.error('v3 ConditionCreated gameEntity not found. gameEntityId = {}', [
      gameEntityId,
    ])

    return
  }

  createCondition(
    VERSION_V3,
    coreAddress,
    conditionId,
    gameEntity.id,
    conditionData.value.margin,
    conditionData.value.reinforcement,
    event.params.outcomes,
    conditionData.value.virtualFunds,
    conditionData.value.winningOutcomesCount,
    conditionData.value.isExpressForbidden,
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
    event.transaction.gasPrice,
    event.receipt !== null ? event.receipt!.gasUsed : null,
    'conditionId',
    event.params.conditionId.toString(),
  )

  const conditionId = event.params.conditionId
  const coreAddress = event.address.toHexString()

  const conditionEntityId = getConditionEntityId(
    coreAddress,
    conditionId.toString(),
  )
  const conditionEntity = Condition.load(conditionEntityId)

  // TODO remove later
  if (!conditionEntity) {
    log.error(
      'v3 handleConditionResolved conditionEntity not found. conditionEntityId = {}',
      [conditionEntityId],
    )

    return
  }

  const liquidityPoolAddress = CoreContract.load(coreAddress)!.liquidityPool

  resolveCondition(
    VERSION_V3,
    liquidityPoolAddress,
    conditionEntity,
    event.params.winningOutcomes,
    event,
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
    event.transaction.gasPrice,
    event.receipt !== null ? event.receipt!.gasUsed : null,
    'conditionId',
    event.params.conditionId.toString(),
  )

  const conditionId = event.params.conditionId
  const coreAddress = event.address.toHexString()

  const conditionEntityId = getConditionEntityId(
    coreAddress,
    conditionId.toString(),
  )
  const conditionEntity = Condition.load(conditionEntityId)

  // TODO remove later
  if (!conditionEntity) {
    log.error(
      'v3 handleConditionStopped conditionEntity not found. conditionEntityId = {}',
      [conditionEntityId],
    )

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
    event.transaction.gasPrice,
    event.receipt !== null ? event.receipt!.gasUsed : null,
    'betId',
    event.params.tokenId.toString(),
  )

  const conditionId = event.params.conditionId
  const coreAddress = event.address.toHexString()

  const conditionEntityId = getConditionEntityId(
    coreAddress,
    conditionId.toString(),
  )
  const conditionEntity = Condition.load(conditionEntityId)

  // TODO remove later
  if (!conditionEntity) {
    log.error(
      'v3 handleNewBet conditionEntity not found. conditionEntityId = {}',
      [conditionEntityId],
    )

    return
  }

  const lp = CoreContract.load(coreAddress)!.liquidityPool
  const liquidityPoolContractEntity = LiquidityPoolContract.load(lp)!

  const outcomeEntityId = getOutcomeEntityId(
    conditionEntity.id,
    event.params.outcomeId.toString(),
  )
  const outcomeEntity = Outcome.load(outcomeEntityId)!

  createBet(
    VERSION_V3,
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
    log.error('getCondition reverted. conditionId = {}', [
      conditionId.toString(),
    ])

    return
  }

  const conditionEntityId = getConditionEntityId(
    coreAddress,
    conditionId.toString(),
  )
  const conditionEntity = Condition.load(conditionEntityId)

  // TODO remove later
  if (!conditionEntity) {
    log.error(
      'v3 handleNewBet handleOddsChanged not found. conditionEntityId = {}',
      [conditionEntityId],
    )

    return
  }

  let outcomesEntities: Outcome[] = []

  for (let i = 0; i < conditionEntity.outcomesIds!.length; i++) {
    const outcomeEntityId = getOutcomeEntityId(
      conditionEntity.id,
      conditionEntity.outcomesIds![i].toString(),
    )
    const outcomeEntity = Outcome.load(outcomeEntityId)!

    outcomesEntities = outcomesEntities.concat([outcomeEntity])
  }

  updateConditionOdds(
    VERSION_V3,
    conditionEntity,
    outcomesEntities,
    conditionData.value.virtualFunds,
    event.block,
  )
}

export function handleMarginChanged(event: MarginChanged): void {
  createEvent(
    'MarginChanged',
    event.address,
    event.transaction.hash.toHexString(),
    event.transaction.index,
    event.logIndex,
    event.block,
    event.transaction.gasPrice,
    event.receipt !== null ? event.receipt!.gasUsed : null,
    'conditionId',
    event.params.conditionId.toString(),
  )

  const conditionId = event.params.conditionId
  const coreAddress = event.address.toHexString()

  const conditionEntityId = getConditionEntityId(
    coreAddress,
    conditionId.toString(),
  )
  const conditionEntity = Condition.load(conditionEntityId)

  // TODO remove later
  if (!conditionEntity) {
    log.error(
      'v3 handleMarginChanged conditionEntity not found. conditionEntityId = {}',
      [conditionEntityId],
    )

    return
  }

  updateConditionMargin(conditionEntity, event.params.newMargin, event.block)
}

export function handleReinforcementChanged(event: ReinforcementChanged): void {
  createEvent(
    'ReinforcementChanged',
    event.address,
    event.transaction.hash.toHexString(),
    event.transaction.index,
    event.logIndex,
    event.block,
    event.transaction.gasPrice,
    event.receipt !== null ? event.receipt!.gasUsed : null,
    'conditionId',
    event.params.conditionId.toString(),
  )

  const conditionId = event.params.conditionId
  const coreAddress = event.address.toHexString()

  const conditionEntityId = getConditionEntityId(
    coreAddress,
    conditionId.toString(),
  )

  const conditionEntity = Condition.load(conditionEntityId)

  // TODO remove later
  if (!conditionEntity) {
    log.error(
      'v3 handleReinforcementChanged conditionEntity not found. conditionEntityId = {}',
      [conditionEntityId],
    )

    return
  }

  updateConditionReinforcement(
    conditionEntity,
    event.params.newReinforcement,
    event.block,
  )
}
