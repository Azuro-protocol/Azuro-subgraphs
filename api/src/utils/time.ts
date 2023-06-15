import { BigInt } from '@graphprotocol/graph-ts'


export function daysBetweenTimestamps(from: BigInt, to: BigInt): i64 {
  const fromTimestamp = new Date(from.times(BigInt.fromString('1000')).toI64())
  const toTimestamp = new Date(to.times(BigInt.fromString('1000')).toI64())
  const diff = toTimestamp.getTime() - fromTimestamp.getTime()

  const daysDiff = (diff / (1000 * 3600 * 24)) as f64

  if (daysDiff < 0) {
    return 0 as i64
  }

  return Math.ceil(daysDiff) as i64
}
