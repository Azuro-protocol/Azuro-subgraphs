import { log } from '@graphprotocol/graph-ts'

import { NewCore, NewPool } from '../../generated/FactoryV2/FactoryV2'
import { CoreContract, LiquidityPoolContract } from '../../generated/schema'
import { LPV2 } from '../../generated/templates'
import { LPV2 as LPAbiV2 } from '../../generated/templates/LPV2/LPV2'
import {
  connectCore,
  createCoreEntity,
  createExpressPrematchRelationEntity,
  getPrematchAddressByExpressAddressV2,
  getPrematchAddressByExpressAddressV3,
} from '../common/factory'
import { createPoolEntity } from '../common/pool'
import { CORE_TYPE_EXPRESS, CORE_TYPE_EXPRESS_V2, CORE_TYPES, VERSION_V2 } from '../constants'
import { LP_WHITELIST } from '../whitelists'


export function handleNewPool(event: NewPool): void {
  const liquidityPoolAddress = event.params.lp.toHexString()

  if (LP_WHITELIST.indexOf(liquidityPoolAddress) === -1) {
    log.warning('v2 handleNewPool skip {} because it isn\'t whitelisted', [liquidityPoolAddress])

    return
  }

  const coreAddress = event.params.core.toHexString()

  const coreType = CORE_TYPES.get(event.params.coreType)

  if (coreType === null) {
    return
  }

  const liquidityPoolSC = LPAbiV2.bind(event.params.lp)

  const token = liquidityPoolSC.try_token()

  if (token.reverted) {
    return
  }

  const liquidityPoolContractEntity = createPoolEntity(
    VERSION_V2,
    coreAddress,
    liquidityPoolAddress,
    token.value.toHexString(),
    event.block,
  )

  LPV2.create(event.params.lp)

  let coreContractEntity = CoreContract.load(coreAddress)

  if (!coreContractEntity) {
    coreContractEntity = createCoreEntity(coreAddress, liquidityPoolContractEntity, coreType)
    connectCore(coreAddress, coreType)
  }

  if (coreType === CORE_TYPE_EXPRESS) {
    const prematchAddress = getPrematchAddressByExpressAddressV2(coreAddress)

    if (prematchAddress !== null) {
      createExpressPrematchRelationEntity(coreAddress, prematchAddress)
    }
  }
}

export function handleNewCore(event: NewCore): void {
  const liquidityPoolAddress = event.params.lp.toHexString()

  if (LP_WHITELIST.indexOf(liquidityPoolAddress) === -1) {
    log.warning('v2 handleNewPool skip {} because it isn\'t whitelisted', [liquidityPoolAddress])

    return
  }

  const coreAddress = event.params.core.toHexString()

  const coreType = CORE_TYPES.get(event.params.coreType)

  if (coreType === null) {
    return
  }

  const liquidityPoolContractEntity = LiquidityPoolContract.load(liquidityPoolAddress)!

  let coreContractEntity = CoreContract.load(coreAddress)

  if (!coreContractEntity) {
    coreContractEntity = createCoreEntity(coreAddress, liquidityPoolContractEntity, coreType)
    connectCore(event.params.core.toHexString(), coreType)
  }

  let prematchAddress: string | null = null

  if (coreType === CORE_TYPE_EXPRESS) {
    prematchAddress = getPrematchAddressByExpressAddressV2(coreAddress)
  }
  else if (coreType === CORE_TYPE_EXPRESS_V2) {
    prematchAddress = getPrematchAddressByExpressAddressV3(coreAddress)
  }

  if (prematchAddress !== null) {
    createExpressPrematchRelationEntity(coreAddress, prematchAddress)
  }
}
