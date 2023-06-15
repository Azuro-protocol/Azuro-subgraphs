import { AzuroBetContract } from '../../generated/schema'


export function createAzuroBetEntity(coreAddress: string, azuroBetAddress: string): AzuroBetContract {
  const azuroBetContractEntity = new AzuroBetContract(azuroBetAddress)
  azuroBetContractEntity.address = azuroBetAddress
  azuroBetContractEntity.core = coreAddress

  azuroBetContractEntity.save()

  return azuroBetContractEntity
}
