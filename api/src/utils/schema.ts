import { BigInt } from '@graphprotocol/graph-ts'


export function getEventEntityId(eventName: string, txHash: string, logIndex: string): string {
  return eventName.concat('_').concat(txHash.concat('_').concat(logIndex))
}

export function getLeagueEntityId(sportId: BigInt, countryName: string, leagueName: string): string {
  return sportId.toString().concat('_').concat(countryName.concat('_').concat(leagueName))
}

export function getGameEntityId(liquidityPoolAddress: string, gameId: string): string {
  return liquidityPoolAddress.concat('_').concat(gameId)
}

export function getConditionEntityId(coreAddress: string, conditionId: string): string {
  return coreAddress.concat('_').concat(conditionId)
}

export function getBetEntityId(coreAddress: string, betId: string): string {
  return coreAddress.concat('_').concat(betId)
}

export function getParticipantEntityId(gameEntityId: string, participantOrder: string): string {
  return gameEntityId.concat('_').concat(participantOrder)
}

export function getOutcomeEntityId(conditionEntityId: string, outcomeId: string): string {
  return conditionEntityId.concat('_').concat(outcomeId)
}

export function getSelectionEntityId(betEntityId: string, conditionId: string): string {
  return betEntityId.concat('_').concat(conditionId)
}

export function getFreebetEntityId(freebetContractAddress: string, freebetId: string): string {
  return freebetContractAddress.concat('_').concat(freebetId)
}

export function getLiquidityPoolNftEntityId(liquidityPoolAddress: string, leaf: string): string {
  return liquidityPoolAddress.concat('_').concat(leaf)
}
