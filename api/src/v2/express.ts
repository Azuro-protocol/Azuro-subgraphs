import { BigInt, log } from '@graphprotocol/graph-ts'

import {
  Condition,
  CoreContract,
  ExpressPrematchRelation,
  LiquidityPoolContract,
  Outcome,
} from '../../generated/schema'
import { NewBet, Transfer } from '../../generated/templates/ExpressV1/ExpressV1'
import { createBet, transferBet } from '../common/bets'
import { createEvent } from '../common/events'
import { BET_TYPE_EXPRESS } from '../constants'
import { getConditionEntityId, getOutcomeEntityId } from '../utils/schema'


export function handleTransfer(event: Transfer): void {
  const betEntity = transferBet(
    event.address.toHexString(),
    null,
    event.params.tokenId,
    event.params.from,
    event.params.to,
    event.block,
  )

  if (betEntity) {
    createEvent(
      'BetTransfer',
      event.address,
      event.transaction.hash.toHexString(),
      event.transaction.index,
      event.logIndex,
      event.block,
      'betId',
      event.params.tokenId.toString(),
    )
  }
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
    event.params.betId.toString(),
  )

  const expressAddress = event.address.toHexString()
  const prematchAddress = ExpressPrematchRelation.load(expressAddress)!.prematchAddress

  let conditionEntities: Condition[] = []
  let outcomeEntities: Outcome[] = []
  let conditionOdds: BigInt[] = []

  for (let i = 0; i < event.params.bet.subBets.length; i++) {
    const bet = event.params.bet.subBets[i]

    const conditionEntityId = getConditionEntityId(prematchAddress, bet.conditionId.toString())
    const conditionEntity = Condition.load(conditionEntityId)

    // TODO remove later
    if (!conditionEntity) {
      log.error('v2 handleNewBet express conditionEntity not found. conditionEntityId = {}', [conditionEntityId])

      return
    }

    conditionEntities[i] = conditionEntity

    const outcomeEntityId = getOutcomeEntityId(conditionEntityId, bet.outcomeId.toString())
    const outcomeEntity = Outcome.load(outcomeEntityId)

    // TODO remove later
    if (!outcomeEntity) {
      log.error('v2 handleNewBet express outcomeEntity not found. outcomeEntityId = {}', [outcomeEntityId])

      return
    }

    outcomeEntities[i] = outcomeEntity

    conditionOdds[i] = event.params.bet.conditionOdds[i]
  }

  const lp = CoreContract.load(prematchAddress)!.liquidityPool
  const liquidityPoolContractEntity = LiquidityPoolContract.load(lp)!

  createBet(
    true,
    BET_TYPE_EXPRESS.toString(),
    conditionEntities,
    outcomeEntities,
    conditionOdds,
    event.params.bet.odds,
    expressAddress,
    event.params.bettor,
    event.params.bet.affiliate,
    event.params.betId,
    liquidityPoolContractEntity.tokenDecimals,
    event.params.bet.amount,
    event.transaction.hash.toHexString(),
    event.block,
    null,
  )
}
