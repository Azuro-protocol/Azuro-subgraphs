import { Address, BigInt } from '@graphprotocol/graph-ts'

import { ERC20 } from '../../generated/templates/LPV1/ERC20'


export function getERC20TokenSymbol(address: string): string {
  const erc20SC = ERC20.bind(Address.fromString(address))
  const symbol = erc20SC.try_symbol()

  if (!symbol.reverted) {
    return symbol.value.toString()
  }

  return ''
}

export function getERC20TokenDecimals(address: string): u8 {
  const erc20SC = ERC20.bind(Address.fromString(address))
  const decimals = erc20SC.try_decimals()

  if (!decimals.reverted) {
    return decimals.value as u8
  }

  return 18 as u8
}

export function getERC20TokenBalance(tokenAddress: string, ownerAddress: string): BigInt {
  const erc20SC = ERC20.bind(Address.fromString(tokenAddress))
  const balance = erc20SC.try_balanceOf(Address.fromString(ownerAddress))

  if (!balance.reverted) {
    return balance.value
  }

  return BigInt.zero()
}
