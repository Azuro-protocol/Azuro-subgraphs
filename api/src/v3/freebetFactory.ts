import { NewFreeBet } from '../../generated/FreebetFactoryV3/FreebetFactoryV3'
import { FreebetV3 } from '../../generated/templates'
import { createFreebetContractEntity } from '../common/freebets'


export function handleNewFreebet(event: NewFreeBet): void {

  const freeBetAddress = event.params.freeBetAddress.toHexString()
  const liquidityPoolAddress = event.params.lpAddress.toHexString()

  createFreebetContractEntity(
    freeBetAddress,
    liquidityPoolAddress,
    null,
    event.params.affiliate.toHexString(),
    event.params.manager.toHexString(),
  )

  FreebetV3.create(event.params.freeBetAddress)
}
