import { log } from '@graphprotocol/graph-ts'

import {
  CoreContract,
  LiquidityPoolContract,
  LiveCondition,
  LiveOutcome,
} from '../../generated/schema'
import {
  ConditionCreated as LiveConditionCreated,
  ConditionResolved as LiveConditionResolved,
  LiveCoreV1 as Core,
  NewLiveBet,
} from '../../generated/templates/LiveCoreV1/LiveCoreV1'
import { createLiveBet } from '../common/bets'
import { createLiveCondition, resolveLiveCondition } from '../common/conditions'
import { createEvent } from '../common/events'
import { BET_TYPE_ORDINAR, VERSION_V3 } from '../constants'
import { getConditionEntityId, getOutcomeEntityId } from '../utils/schema'


export function handleLiveConditionCreated(event: LiveConditionCreated): void {
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
    log.error('getLiveCondition reverted. liveConditionId = {}', [
      conditionId.toString(),
    ])

    return
  }

  createLiveCondition(
    coreAddress,
    conditionId,
    event.params.gameId,
    event.params.outcomes,
    conditionData.value.winningOutcomesCount,
    event.transaction.hash.toHexString(),
    event.block,
  )
}

export function handleLiveConditionResolved(
  event: LiveConditionResolved,
): void {
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

  const liveConditionId = event.params.conditionId
  const coreAddress = event.address.toHexString()

  const liveConditionEntityId = getConditionEntityId(
    coreAddress,
    liveConditionId.toString(),
  )
  const liveConditionEntity = LiveCondition.load(liveConditionEntityId)

  // TODO remove later
  if (!liveConditionEntity) {
    log.error(
      'handleConditionResolved liveConditionEntity not found. liveConditionEntityId = {}',
      [liveConditionEntityId],
    )

    return
  }

  resolveLiveCondition(
    liveConditionEntity,
    event.params.winningOutcomes,
    event,
  )

}

export function handleNewLiveBet(event: NewLiveBet): void {
  createEvent(
    'NewLiveBet',
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

  const liveConditionId = event.params.conditionId
  const coreAddress = event.address.toHexString()

  const liveConditionEntityId = getConditionEntityId(
    coreAddress,
    liveConditionId.toString(),
  )

  const liveConditionEntity = LiveCondition.load(liveConditionEntityId)

  if (!liveConditionEntity) {
    log.error(
      'handleNewLiveBet liveConditionEntity not found. liveConditionEntityId = {}',
      [liveConditionEntityId],
    )

    return
  }

  const liquidityPoolAddress = CoreContract.load(coreAddress)!.liquidityPool
  const liquidityPoolContractEntity = LiquidityPoolContract.load(liquidityPoolAddress)!

  const liveOutcomeEntityId = getOutcomeEntityId(
    liveConditionEntity.id,
    event.params.outcomeId.toString(),
  )

  const liveOutcomeEntity = LiveOutcome.load(liveOutcomeEntityId)!

  createLiveBet(
    VERSION_V3,
    BET_TYPE_ORDINAR.toString(),
    [liveConditionEntity],
    [liveOutcomeEntity],
    [event.params.odds],
    event.params.odds,
    liveConditionEntity.coreAddress,
    event.params.bettor,
    event.params.affiliate,
    event.params.tokenId,
    liquidityPoolContractEntity.tokenDecimals,
    event.params.amount,
    event.params.payoutLimit,
    event.transaction.hash.toHexString(),
    event.block,
  )
}
