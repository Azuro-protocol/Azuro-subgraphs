import { BigDecimal, BigInt, bigInt } from '@graphprotocol/graph-ts'

import { C1e9, C1e12 } from '../constants'


function addMargin(odds: BigInt, margin: BigInt, decimals: BigInt): BigInt {
  const revertedOdds = decimals.pow(2).div(decimals.minus(decimals.pow(2).div(odds)))
  const marginEUR = decimals.plus(margin)
  const a = marginEUR.times(revertedOdds.minus(decimals)).div(odds.minus(decimals))

  const b = revertedOdds
    .minus(decimals)
    .times(decimals)
    .div(odds.minus(decimals))
    .times(margin)
    .plus(decimals.times(margin))
    .div(decimals)
  const c = decimals.times(BigInt.fromString('2')).minus(marginEUR)

  const newOdds = b
    .pow(2)
    .plus(BigInt.fromString('4').times(a).times(c))
    .sqrt()
    .minus(b)
    .times(decimals)
    .div(BigInt.fromString('2').times(a))
    .plus(decimals)

  return newOdds
}


function ceil(a: BigInt, m: BigInt, decimals: BigInt): BigInt {
  if (a.lt(decimals)) {
    return decimals
  }

  return a.plus(m).minus(BigInt.fromString('1')).div(m).times(m)
}

function v1(fund1: BigInt, fund2: BigInt, amount: BigInt, outcomeIndex: i32, margin: BigInt, decimals: BigInt): BigInt {
  if (outcomeIndex === 0) {
    const pe1 = fund1.plus(amount).times(decimals).div(fund1.plus(fund2).plus(amount))
    const ps1 = fund1.times(decimals).div(fund1.plus(fund2))
    const cAmount = ceil(amount.times(decimals).div(fund1.div(BigInt.fromString('100'))), decimals, decimals).div(
      decimals,
    )

    if (cAmount.equals(BigInt.fromString('1'))) {
      return addMargin(decimals.pow(2).div(ps1), margin, decimals)
    }

    const odds = decimals.pow(3).div(
      pe1
        .times(cAmount)
        .plus(ps1.times(BigInt.fromString('2')))
        .minus(pe1.times(BigInt.fromString('2')))
        .times(decimals)
        .div(cAmount),
    )

    return addMargin(odds, margin, decimals)
  }

  if (outcomeIndex === 1) {
    const pe2 = fund2.plus(amount).times(decimals).div(fund1.plus(fund2).plus(amount))
    const ps2 = fund2.times(decimals).div(fund1.plus(fund2))
    const cAmount = ceil(amount.times(decimals).div(fund2.div(BigInt.fromString('100'))), decimals, decimals).div(
      decimals,
    )

    if (cAmount.equals(BigInt.fromString('1'))) {
      return addMargin(decimals.pow(2).div(ps2), margin, decimals)
    }

    const odds = decimals.pow(3).div(
      pe2
        .times(cAmount)
        .plus(ps2.times(BigInt.fromString('2')))
        .minus(pe2.times(BigInt.fromString('2')))
        .times(decimals)
        .div(cAmount),
    )

    return addMargin(odds, margin, decimals)
  }

  return BigInt.zero()
}

function v2(fund1: BigInt, fund2: BigInt, amount: BigInt, outcomeIndex: i32, margin: BigInt, decimals: BigInt): BigInt {
  const activeFund = outcomeIndex === 0 ? fund1 : fund2

  const odds = fund1.plus(fund2).plus(amount).times(C1e12).div(activeFund.plus(amount))

  if (odds.equals(C1e12)) {
    return BigInt.zero()
  }

  return addMargin(odds, margin, decimals)
}

export function getOdds(
  isV2: boolean,
  fund1: BigInt,
  fund2: BigInt,
  amount: BigInt,
  outcomeIndex: i32,
  margin: BigInt,
): BigInt {
  if (isV2) {
    return v2(fund1, fund2, amount, outcomeIndex, margin, C1e12)
  }

  return v1(fund1, fund2, amount, outcomeIndex, margin, C1e9)
}

export function toDecimal(x: BigInt, decimals: i32 = 18): BigDecimal {
  const divisor = new BigDecimal(bigInt.pow(BigInt.fromU32(10), decimals as u8))

  return new BigDecimal(x).div(divisor)
}
