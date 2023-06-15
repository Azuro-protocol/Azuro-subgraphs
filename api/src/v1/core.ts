import { Address, log } from '@graphprotocol/graph-ts'

import {
  ConditionCreated,
  ConditionResolved,
  ConditionShifted,
  ConditionStopped,
  CoreV1,
  LpChanged,
} from '../../generated/CoreV1/CoreV1'
import { Condition, CoreContract } from '../../generated/schema'
import { AzuroBetV1, LPV1 } from '../../generated/templates'
import { LPV1 as LPV1Abi } from '../../generated/templates/LPV1/LPV1'
import { createAzuroBetEntity } from '../common/azurobet'
import { createCondition, pauseUnpauseCondition, resolveCondition } from '../common/conditions'
import { createEvent } from '../common/events'
import { createCoreEntity } from '../common/factory'
import { createGame, shiftGame } from '../common/games'
import { createPoolEntity } from '../common/pool'
import { CORE_TYPE_PRE_MATCH } from '../constants'
import { getConditionEntityId } from '../utils/schema'


export function handleLpChanged(event: LpChanged): void {
  const coreAddress = event.address.toHexString()
  const liquidityPoolAddress = event.params.newLp.toHexString()

  const liquidityPoolSC = LPV1Abi.bind(Address.fromString(liquidityPoolAddress))

  const token = liquidityPoolSC.try_token()

  if (token.reverted) {
    log.error('v1 handleLpChanged call token reverted', [])

    return
  }

  const liquidityPoolContractEntity = createPoolEntity(
    false,
    coreAddress,
    liquidityPoolAddress,
    token.value.toHexString(),
    event.block,
  )

  LPV1.create(Address.fromString(liquidityPoolAddress))

  let coreContractEntity = CoreContract.load(coreAddress)

  if (!coreContractEntity) {
    coreContractEntity = createCoreEntity(coreAddress, liquidityPoolContractEntity, CORE_TYPE_PRE_MATCH)
  }

  const azuroBetAddress = liquidityPoolSC.try_azuroBet()

  if (azuroBetAddress.reverted) {
    log.error('v1 handleLpChanged call azuroBet reverted', [])

    return
  }

  createAzuroBetEntity(coreAddress, azuroBetAddress.value.toHexString())

  AzuroBetV1.create(azuroBetAddress.value)
}

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

  const coreContractEntity = CoreContract.load(event.address.toHexString())

  // TODO remove later
  if (!coreContractEntity) {
    log.error('v1 ConditionCreated coreContractEntity not found. coreContractEntityId = {}', [
      event.address.toHexString(),
    ])

    return
  }

  const conditionId = event.params.conditionId
  const startsAt = event.params.timestamp

  const coreSC = CoreV1.bind(event.address)
  const conditionData = coreSC.try_getCondition(conditionId)

  if (conditionData.reverted) {
    log.error('getCondition reverted. conditionId = {}', [conditionId.toString()])

    return
  }

  const coreAddress = event.address.toHexString()
  const liquidityPoolAddress = CoreContract.load(coreAddress)!.liquidityPool

  const gameEntity = createGame(
    liquidityPoolAddress,
    null,
    null,
    conditionData.value.ipfsHash,
    startsAt,
    event.transaction.hash.toHexString(),
    event.block,
  )

  // TODO remove later
  if (!gameEntity) {
    log.error('v1 ConditionCreated can\'t create game. conditionId = {}', [conditionId.toString()])

    return
  }

  createCondition(
    false,
    coreAddress,
    conditionId,
    gameEntity.id,
    conditionData.value.margin,
    conditionData.value.reinforcement,
    conditionData.value.outcomes,
    conditionData.value.fundBank,
    gameEntity.provider,
    event.transaction.hash.toHexString(),
    event.block,
    startsAt,
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
    log.error('v1 handleConditionResolved conditionEntity not found. conditionEntityId = {}', [conditionEntityId])

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
    log.error('v1 handleConditionStopped conditionEntity not found. conditionEntityId = {}', [conditionEntityId])

    return
  }

  pauseUnpauseCondition(conditionEntity, event.params.flag, event.block)
}

export function handleConditionShifted(event: ConditionShifted): void {
  createEvent(
    'ConditionShifted',
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
    log.error('v1 ConditionShifted conditionEntity not found. conditionEntityId = {}', [conditionEntityId])

    return
  }

  shiftGame(conditionEntity.game, event.params.newTimestamp, event.transaction.hash.toHexString(), event.block)

  conditionEntity.internalStartsAt = event.params.newTimestamp
  conditionEntity._updatedAt = event.block.timestamp
  conditionEntity.save()
}
