import { log } from '@graphprotocol/graph-ts'

import { NewCore, NewPool } from '../../generated/FactoryV1/FactoryV1'
import { CoreContract, LiquidityPoolContract } from '../../generated/schema'
import { LPV2 as LP } from '../../generated/templates'
import { LPV2 as LPAbi } from '../../generated/templates/LPV2/LPV2'
import {
  connectCore,
  createCoreEntity,
  createExpressPrematchRelationEntity,
  getPrematchAddressByExpressAddress,
} from '../common/factory'
import { createPoolEntity } from '../common/pool'
import { CORE_TYPE_EXPRESS, CORE_TYPES } from '../constants'
import { EXPRESS_WHITELIST, LP_V2_WHITELIST } from '../whitelists'


export function handleNewPool(event: NewPool): void {
  const liquidityPoolAddress = event.params.lp.toHexString()

  if (LP_V2_WHITELIST.indexOf(liquidityPoolAddress) === -1) {
    log.warning('v2 handleNewPool skip {} because it isn\'t whitelisted', [liquidityPoolAddress])

    return
  }

  const coreAddress = event.params.core.toHexString()

  const coreType = CORE_TYPES.get(event.params.coreType)

  if (coreType === null) {
    return
  }

  const liquidityPoolSC = LPAbi.bind(event.params.lp)

  const token = liquidityPoolSC.try_token()

  if (token.reverted) {
    return
  }

  const liquidityPoolContractEntity = createPoolEntity(
    true,
    coreAddress,
    liquidityPoolAddress,
    token.value.toHexString(),
    event.block,
  )

  LP.create(event.params.lp)

  let coreContractEntity = CoreContract.load(coreAddress)

  if (!coreContractEntity) {
    coreContractEntity = createCoreEntity(coreAddress, liquidityPoolContractEntity, coreType)
    connectCore(coreAddress, coreType)
  }

  if (coreType === CORE_TYPE_EXPRESS) {
    const prematchAddress = getPrematchAddressByExpressAddress(coreAddress)

    if (prematchAddress !== null) {
      createExpressPrematchRelationEntity(coreAddress, prematchAddress)
    }
  }
}

export function handleNewCore(event: NewCore): void {
  const liquidityPoolAddress = event.params.lp.toHexString()

  if (LP_V2_WHITELIST.indexOf(liquidityPoolAddress) === -1) {
    log.warning('v2 handleNewPool skip {} because it isn\'t whitelisted', [liquidityPoolAddress])

    return
  }

  const coreAddress = event.params.core.toHexString()

  const coreType = CORE_TYPES.get(event.params.coreType)

  if (coreType === null) {
    return
  }

  if (coreType === CORE_TYPE_EXPRESS && EXPRESS_WHITELIST.indexOf(coreAddress) === -1) {
    log.warning('v2 handleNewCore skip {} because it isn\'t whitelisted', [coreAddress])

    return
  }

  const liquidityPoolContractEntity = LiquidityPoolContract.load(liquidityPoolAddress)!

  let coreContractEntity = CoreContract.load(coreAddress)

  if (!coreContractEntity) {
    coreContractEntity = createCoreEntity(coreAddress, liquidityPoolContractEntity, coreType)
    connectCore(event.params.core.toHexString(), coreType)
  }

  if (coreType === CORE_TYPE_EXPRESS) {
    const prematchAddress = getPrematchAddressByExpressAddress(coreAddress)

    if (prematchAddress !== null) {
      createExpressPrematchRelationEntity(coreAddress, prematchAddress)
    }
  }
}
