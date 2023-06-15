import { Address, BigInt, ethereum, Value } from '@graphprotocol/graph-ts'

import { Event } from '../../generated/schema'
import { addLeadZerosOrSlice } from '../utils/array'
import { getEventEntityId } from '../utils/schema'


export function createEvent(
  eventName: string,
  contractAddress: Address,
  txHash: string,
  transactionIndex: BigInt,
  logIndex: BigInt,
  block: ethereum.Block,
  paramName: string | null = null,
  paramValue: string | null = null,
): Event {
  const eventEntityId = getEventEntityId(eventName, txHash, logIndex.toString())
  const eventEntity = new Event(eventEntityId)

  eventEntity.name = eventName
  eventEntity.contractAddress = contractAddress.toHexString()

  eventEntity.txHash = txHash
  eventEntity.transactionIndex = transactionIndex
  eventEntity.logIndex = logIndex

  const transactionLogKey = addLeadZerosOrSlice(logIndex.toString(), 6)

  eventEntity.sortOrder = BigInt.fromString(block.number.toString().concat(transactionLogKey))

  eventEntity.blockNumber = block.number
  eventEntity.blockTimestamp = block.timestamp

  if (paramName && paramValue) {
    eventEntity.set(paramName, Value.fromString(paramValue))
  }

  eventEntity.save()

  return eventEntity
}
