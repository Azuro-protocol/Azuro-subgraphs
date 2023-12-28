import { BigInt } from '@graphprotocol/graph-ts'
import { assert, describe, test } from 'matchstick-as/assembly/index'

import { VERSION_V3 } from '../src/constants'
import { getOdds } from '../src/utils/math'


describe('getOdds()', () => {

  test('odds for 2-outcomes market', () => {

    const fund1 = BigInt.fromString('114598540145985401459854')
    const fund2 = BigInt.fromString('185401459854014598540146')

    const margin = BigInt.fromString('75000000000')

    const odds = getOdds(VERSION_V3, [fund1, fund2], margin, 1)

    assert.assertNotNull<BigInt[] | null>(odds)

    assert.bigIntEquals(BigInt.fromString('2363245489767'), odds![0])
    assert.bigIntEquals(BigInt.fromString('1519908870726'), odds![1])

  })

  test('odds for 2-outcomes market and zero margin', () => {

    const fund1 = BigInt.fromString('114598540145985401459854')
    const fund2 = BigInt.fromString('185401459854014598540146')

    const margin = BigInt.fromString('0')

    const odds = getOdds(VERSION_V3, [fund1, fund2], margin, 1)

    assert.assertNotNull<BigInt[] | null>(odds)

    assert.bigIntEquals(BigInt.fromString('2617834394910'), odds![0])
    assert.bigIntEquals(BigInt.fromString('1618110236220'), odds![1])

  })

  test('odds for crazy funds', () => {

    const fund1 = BigInt.fromString('114598540145985401459854')
    const fund2 = BigInt.fromString('185401459')

    const margin = BigInt.fromString('0')

    const odds = getOdds(VERSION_V3, [fund1, fund2], margin, 1)

    assert.assertNull<BigInt[] | null>(odds)

  })

  test('odds for full time result', () => {

    const fund1 = BigInt.fromString('316500000000000000000')
    const fund2 = BigInt.fromString('339300000000000000000')
    const fund3 = BigInt.fromString('344200000000000000000')

    const margin = BigInt.fromString('75000000000')

    const odds = getOdds(VERSION_V3, [fund1, fund2, fund3], margin, 1)

    assert.assertNotNull<BigInt[] | null>(odds)

    assert.bigIntEquals(BigInt.fromString('2916560365854'), odds![0])
    assert.bigIntEquals(BigInt.fromString('2728008891971'), odds![1])
    assert.bigIntEquals(BigInt.fromString('2690749072771'), odds![2])

  })

  test('odds for double chance', () => {

    const fund1 = BigInt.fromString('316500000000000000000')
    const fund2 = BigInt.fromString('339300000000000000000')
    const fund3 = BigInt.fromString('344200000000000000000')

    const margin = BigInt.fromString('75000000000')

    const odds = getOdds(VERSION_V3, [fund1, fund2, fund3], margin, 2)

    assert.assertNotNull<BigInt[] | null>(odds)

    assert.bigIntEquals(BigInt.fromString('1449282175875'), odds![0])
    assert.bigIntEquals(BigInt.fromString('1366742503132'), odds![1])
    assert.bigIntEquals(BigInt.fromString('1350441337154'), odds![2])
  })

  test('odds real market', () => {

    const fund1 = BigInt.fromString('377596908476967709')
    const fund2 = BigInt.fromString('622403091523958145')

    const margin = BigInt.fromString('85000000000')

    const odds = getOdds(VERSION_V3, [fund1, fund2], margin, 1)

    assert.assertNotNull<BigInt[] | null>(odds)

    assert.bigIntEquals(BigInt.fromString('2353606913107'), odds![0])
    assert.bigIntEquals(BigInt.fromString('1496969259778'), odds![1])
  })

  test('odds real market 2', () => {

    const fund1 = BigInt.fromString('423201418535676431')
    const fund2 = BigInt.fromString('200822836282556019')
    const fund3 = BigInt.fromString('375975745182763268')

    const margin = BigInt.fromString('75000000000')

    const odds = getOdds(VERSION_V3, [fund1, fund2, fund3], margin, 2)

    assert.assertNotNull<BigInt[] | null>(odds)

    assert.bigIntEquals(BigInt.fromString('1133245425091'), odds![0])
    assert.bigIntEquals(BigInt.fromString('2104976587442'), odds![1])
    assert.bigIntEquals(BigInt.fromString('1242736190177'), odds![2])
  })

  test('odds real market 3', () => {

    const fund1 = BigInt.fromString('926053615427262604')
    const fund2 = BigInt.fromString('73946384574058738')

    const margin = BigInt.fromString('100000000000')

    const odds = getOdds(VERSION_V3, [fund1, fund2], margin, 1)

    assert.assertNotNull<BigInt[] | null>(odds)

    assert.bigIntEquals(BigInt.fromString('1033400767268'), odds![0])
    assert.bigIntEquals(BigInt.fromString('6971929127745'), odds![1])
  })

  test('odds real market 4', () => {

    const fund1 = BigInt.fromString('338363626602363001')
    const fund2 = BigInt.fromString('151639734989569413')
    const fund3 = BigInt.fromString('509996638410013978')

    const margin = BigInt.fromString('75000000000')

    const odds = getOdds(VERSION_V3, [fund1, fund2, fund3], margin, 1)

    assert.assertNotNull<BigInt[] | null>(odds)

    assert.bigIntEquals(BigInt.fromString('2713067752641'), odds![0])
    assert.bigIntEquals(BigInt.fromString('5905155212160'), odds![1])
    assert.bigIntEquals(BigInt.fromString('1841108383206'), odds![2])
  })

  test('odds after oddsChanged virtualFund is 0', () => {

    const fund1 = BigInt.fromString('0')
    const fund2 = BigInt.fromString('0')

    const margin = BigInt.fromString('75000000000')

    const odds = getOdds(VERSION_V3, [fund1, fund2], margin, 1)

    assert.assertNull<BigInt[] | null>(odds)
  })


})
