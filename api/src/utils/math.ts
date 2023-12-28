import { BigDecimal, BigInt, bigInt, log } from '@graphprotocol/graph-ts'

import { C1e9, C1e12, VERSION_V2, VERSION_V3 } from '../constants'


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

export function toDecimal(x: BigInt, decimals: i32 = 18): BigDecimal {
  const divisor = new BigDecimal(bigInt.pow(BigInt.fromU32(10), decimals as u8))

  return new BigDecimal(x).div(divisor)
}

function ceil(a: BigInt, m: BigInt, decimals: BigInt): BigInt {
  if (a.lt(decimals)) {
    return decimals
  }

  return a.plus(m).minus(BigInt.fromString('1')).div(m).times(m)
}

function v1(fund1: BigInt, fund2: BigInt, outcomeIndex: i32, margin: BigInt, decimals: BigInt): BigInt {

  const amount = BigInt.fromString('0')

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

function v2(fund1: BigInt, fund2: BigInt, outcomeIndex: i32, margin: BigInt, decimals: BigInt): BigInt {
  const amount = BigInt.fromString('0')

  const activeFund = outcomeIndex === 0 ? fund1 : fund2

  const odds = fund1.plus(fund2).plus(amount).times(C1e12).div(activeFund.plus(amount))

  if (odds.equals(C1e12)) {
    return BigInt.zero()
  }

  return addMargin(odds, margin, decimals)
}

// v3
const MAX_ITERATIONS = 32 as i32
const MAX_ODDS = BigInt.fromString('100').times(C1e12)
const PRECISION = BigInt.fromString('1000000')

function sum(items: BigInt[]): BigInt {

  let acc = BigInt.fromString('0')

  for (let i = 0; i < items.length; i++) {
    acc = acc.plus(items[i])
  }

  return acc
}

function mul(self: BigInt, other: BigInt): BigInt {
  return self.times(other).div(C1e12)
}

function div(self: BigInt, other: BigInt): BigInt {
  return self.times(C1e12).div(other)
}

function ratio(self: BigInt, other: BigInt): BigInt {
  return self.gt(other) ? div(self, other) : div(other, self)
}

function calcProbability(outcomeFund: BigInt, fund: BigInt, winningOutcomesCount: u8): BigInt | null {
  const probability = div(outcomeFund.times(BigInt.fromI32(winningOutcomesCount)), fund)

  if (probability.lt(BigInt.fromString('1000')) || probability.ge(C1e12)) {

    log.error('v3 odds probability lower than 100 or greater than 1^12, outcomeFund is {}', [outcomeFund.toString()])

    return null
  }

  return probability
}

// /**
//  * @notice Implementation of the sigmoid function.
//  * @notice The sigmoid function is commonly used in machine learning to limit output values within a range of 0 to 1.
//  */
function sigmoid(self: BigInt): BigInt {
  return div(self, self.plus(C1e12))
}

function getOddsFromProbabilities(probabilities: BigInt[], margin: BigInt, winningOutcomesCount: u8): BigInt[] | null {

  const length = probabilities.length

  const odds: BigInt[] = []
  const spreads: BigInt[] = []

  if (margin.le(BigInt.fromString('0'))) {

    for (let i = 0; i < length; i++) {
      odds[i] = C1e12.times(C1e12).div(probabilities[i])
    }

    return odds
  }

  for (let i = 0; i < length; i++) {
    spreads[i] = mul(C1e12.minus(probabilities[i]), margin)
  }

  let error = margin
  const spreadMultiplier = BigInt.fromI32(winningOutcomesCount).times(C1e12)

  for (let k = 0; k < MAX_ITERATIONS; ++k) {

    let oddsSpread = BigInt.fromString('0')
    {
      let spread = BigInt.fromString('0')

      for (let i = 0; i < length; i++) {
        const price = div(C1e12.minus(spreads[i]), probabilities[i])
        odds[i] = price
        spread = spread.plus(div(C1e12, price))
      }

      oddsSpread = C1e12.minus(div(spreadMultiplier, spread))
    }

    if (ratio(margin, oddsSpread).minus(C1e12).lt(PRECISION)) {
      return odds
    }

    if (margin.le(oddsSpread)) {
      log.error('margin <= oddsSpread', [])

      return null
    }

    const newError = margin.minus(oddsSpread)

    if (newError === error) {
      if (div(margin, oddsSpread).minus(C1e12).ge(PRECISION)) {
        log.error('margin / oddsSpread - 1 >= precision', [])

        return null
      }

      return odds
    }

    error = newError

    for (let i = 0; i < length; i++) {

      const sig = sigmoid(
        div(
          div(
            div(
              mul(error, spreads[i]),
              C1e12.minus(div(C1e12, odds[i])),
            ),
            C1e12.minus(margin),
          ),
          oddsSpread,
        ),
      )

      spreads[i] = spreads[i].plus(mul(
        C1e12.minus(spreads[i]).minus(probabilities[i]),
        sig,
      ))
    }
  }

  return odds
}

export function v3(funds: BigInt[], margin: BigInt, winningOutcomesCount: u8): BigInt[] | null {

  const probabilities: BigInt[] = []
  const totalFund = sum(funds)

  if (totalFund.equals(BigInt.fromString('0'))) {
    log.error('v3 totalFund is 0', [])

    return null
  }

  for (let i = 0; i < funds.length; i++) {

    const probability = calcProbability(funds[i], totalFund, winningOutcomesCount)

    if (probability === null) {
      log.error('v3 odds probability is null, fund[{}] is {}', [i.toString(), funds[i].toString()])

      return null
    }

    probabilities[i] = probability
  }

  const odds = getOddsFromProbabilities(probabilities, margin, winningOutcomesCount)

  if (odds === null) {
    return null
  }

  for (let i = 0; i < funds.length; i++) {

    if (odds[i].gt(MAX_ODDS)) {
      odds[i] = MAX_ODDS
    }

    if (odds[i].le(C1e12)) {
      log.error('v3 odds[{}] {} lower than 1^12, fund[{}] is {}', [i.toString(), odds[i].toString(), i.toString(), funds[i].toString()])

      return null
    }
  }

  return odds

}

export function getOdds(version: string, funds: BigInt[], margin: BigInt, winningOutcomesCount: i32): BigInt[] | null {

  if (version === VERSION_V3) {
    return v3(funds, margin, winningOutcomesCount as u8)
  }

  if (version === VERSION_V2) {
    return [v2(funds[0], funds[1], 0, margin, C1e12), v2(funds[0], funds[1], 1, margin, C1e12)]
  }

  return [v1(funds[0], funds[1], 0, margin, C1e9), v1(funds[0], funds[1], 1, margin, C1e9)]
}
