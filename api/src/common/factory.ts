import { Address, log } from '@graphprotocol/graph-ts'

import { CoreContract, ExpressPrematchRelation, LiquidityPoolContract } from '../../generated/schema'
import { AzuroBetV2 as AzuroBet, CoreV2 as Core, ExpressV1 as Express } from '../../generated/templates'
import { CoreV2 as CoreAbi } from '../../generated/templates/CoreV2/CoreV2'
import { ExpressV1 as ExpressAbi } from '../../generated/templates/ExpressV1/ExpressV1'
import { CORE_TYPE_EXPRESS, CORE_TYPE_PRE_MATCH } from '../constants'
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

export function getPrematchAddressByExpressAddress(expressAddress: string): string | null {
  const expressSC = ExpressAbi.bind(Address.fromString(expressAddress))
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
  const expressPrematchRelationEntity = new ExpressPrematchRelation(expressAddress)
  expressPrematchRelationEntity.prematchAddress = CoreContract.load(prematchAddress)!.id
  expressPrematchRelationEntity.save()

  return expressPrematchRelationEntity
}

export function connectCore(coreAddress: string, coreType: string): void {
  const coreAddressTyped = Address.fromString(coreAddress)

  if (coreType === CORE_TYPE_PRE_MATCH) {
    Core.create(coreAddressTyped)

    const coreSC = CoreAbi.bind(coreAddressTyped)

    const azuroBetAddress = coreSC.try_azuroBet()

    if (azuroBetAddress.reverted) {
      log.error('v2 handleNewPool call azuroBet reverted', [])

      return
    }

    createAzuroBetEntity(coreAddress, azuroBetAddress.value.toHexString())

    AzuroBet.create(azuroBetAddress.value)
  }
  else if (coreType === CORE_TYPE_EXPRESS) {
    Express.create(coreAddressTyped)
  }
}
