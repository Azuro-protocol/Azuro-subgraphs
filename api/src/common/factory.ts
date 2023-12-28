import { Address, log } from '@graphprotocol/graph-ts'

import {
  CoreContract,
  ExpressPrematchRelation,
  LiquidityPoolContract,
} from '../../generated/schema'
import {
  AzuroBetV2 as AzuroBet,
  CoreV2,
  CoreV3,
  ExpressV2,
  ExpressV3,
  LiveCoreV1,
} from '../../generated/templates'
import { CoreV2 as CoreAbiV2 } from '../../generated/templates/CoreV2/CoreV2'
import { CoreV3 as CoreAbiV3 } from '../../generated/templates/CoreV3/CoreV3'
import { ExpressV2 as ExpressAbiV2 } from '../../generated/templates/ExpressV2/ExpressV2'
import { ExpressV3 as ExpressAbiV3 } from '../../generated/templates/ExpressV3/ExpressV3'
import { LiveCoreV1 as LiveCoreAbiV1 } from '../../generated/templates/LiveCoreV1/LiveCoreV1'
import {
  CORE_TYPE_EXPRESS,
  CORE_TYPE_EXPRESS_V2,
  CORE_TYPE_LIVE,
  CORE_TYPE_PRE_MATCH,
  CORE_TYPE_PRE_MATCH_V2,
} from '../constants'
import { createAzuroBetEntity } from './azurobet'


export function createCoreEntity(
  coreAddress: string,
  liquidityPoolContractEntity: LiquidityPoolContract,
  coreType: string,
): CoreContract {
  const coreContractEntity = new CoreContract(coreAddress)
  coreContractEntity.liquidityPool = liquidityPoolContractEntity.id
  coreContractEntity.address = coreAddress
  coreContractEntity.type = coreType
  coreContractEntity.save()

  return coreContractEntity
}

export function getPrematchAddressByExpressAddressV2(
  expressAddress: string,
): string | null {
  const expressSC = ExpressAbiV2.bind(Address.fromString(expressAddress))
  const prematchCore = expressSC.try_core()

  if (prematchCore.reverted) {
    log.error('core reverted.', [])

    return null
  }

  return prematchCore.value.toHexString()
}

export function getPrematchAddressByExpressAddressV3(
  expressAddress: string,
): string | null {
  const expressSC = ExpressAbiV3.bind(Address.fromString(expressAddress))
  const prematchCore = expressSC.try_core()

  if (prematchCore.reverted) {
    log.error('core reverted.', [])

    return null
  }

  return prematchCore.value.toHexString()
}

export function createExpressPrematchRelationEntity(
  expressAddress: string,
  prematchAddress: string,
): ExpressPrematchRelation {
  const expressPrematchRelationEntity = new ExpressPrematchRelation(
    expressAddress,
  )
  expressPrematchRelationEntity.prematchAddress = CoreContract.load(prematchAddress)!.id
  expressPrematchRelationEntity.save()

  return expressPrematchRelationEntity
}

export function connectCore(coreAddress: string, coreType: string): void {
  const coreAddressTyped = Address.fromString(coreAddress)

  if (coreType === CORE_TYPE_PRE_MATCH) {
    CoreV2.create(coreAddressTyped)

    const coreSC = CoreAbiV2.bind(coreAddressTyped)

    const azuroBetAddress = coreSC.try_azuroBet()

    if (azuroBetAddress.reverted) {
      log.error('handleNewPool call azuroBet reverted', [])

      return
    }

    createAzuroBetEntity(coreAddress, azuroBetAddress.value.toHexString())

    AzuroBet.create(azuroBetAddress.value)
  }
  else if (coreType === CORE_TYPE_PRE_MATCH_V2) {
    CoreV3.create(coreAddressTyped)

    const coreSC = CoreAbiV3.bind(coreAddressTyped)

    const azuroBetAddress = coreSC.try_azuroBet()

    if (azuroBetAddress.reverted) {
      log.error('handleNewPool call azuroBet reverted', [])

      return
    }

    createAzuroBetEntity(coreAddress, azuroBetAddress.value.toHexString())

    AzuroBet.create(azuroBetAddress.value)
  }
  else if (coreType === CORE_TYPE_LIVE) {
    LiveCoreV1.create(coreAddressTyped)

    const coreSC = LiveCoreAbiV1.bind(coreAddressTyped)

    const azuroBetAddress = coreSC.try_azuroBet()

    if (azuroBetAddress.reverted) {
      log.error('handleNewPool call azuroBet reverted', [])

      return
    }

    createAzuroBetEntity(coreAddress, azuroBetAddress.value.toHexString())

    AzuroBet.create(azuroBetAddress.value)
  }
  else if (coreType === CORE_TYPE_EXPRESS) {
    ExpressV2.create(coreAddressTyped)
  }
  else if (coreType === CORE_TYPE_EXPRESS_V2) {
    ExpressV3.create(coreAddressTyped)
  }
}
