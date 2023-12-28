import { Transfer } from '../../generated/templates/AzuroBetV2/AzuroBetV2'
import { transferBet } from '../common/bets'
import { createEvent } from '../common/events'


export function handleTransfer(event: Transfer): void {
  const betEntity = transferBet(
    null,
    event.address.toHexString(),
    event.params.tokenId,
    event.params.from,
    event.params.to,
    event.block,
  )

  if (betEntity) {
    createEvent(
      'AzuroBetTransfer',
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
  }
}
