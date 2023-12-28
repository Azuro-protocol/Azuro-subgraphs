import {
  BigInt, ByteArray, Bytes, ethereum, json, JSONValue, JSONValueKind, log, TypedMap,
} from '@graphprotocol/graph-ts'

import {
  Country, Game, League, Participant, Sport, SportHub,
} from '../../generated/schema'
import { DEFAULT_COUNTRY, GAME_STATUS_CANCELED, GAME_STATUS_CREATED } from '../constants'
import { sportHubs } from '../dictionaties/sportHubs'
import { sports } from '../dictionaties/sports'
import { getImageUrl } from '../utils/images'
import { getIPFSJson } from '../utils/ipfs'
import { getGameEntityId, getLeagueEntityId, getParticipantEntityId } from '../utils/schema'
import { toSlug } from '../utils/text'


export function createGame(
  liquidityPoolAddress: string,
  rawGameId: BigInt | null,
  ipfsHashBytes: Bytes | null,
  dataBytes: Bytes | null,
  startsAt: BigInt,
  network: string | null,
  txHash: string,
  createBlock: ethereum.Block,
): Game | null {

  let data: TypedMap<string, JSONValue> | null = null

  // V2
  if (ipfsHashBytes !== null) {
    const ipfsHashHex = ipfsHashBytes.toHexString()
    const bytesArr = ByteArray.fromHexString(`0x1220${ipfsHashHex.slice(2)}`)

    const ipfsHash = bytesArr.toBase58()

    const ipfsJson = getIPFSJson(ipfsHash)

    if (!ipfsJson) {
      log.error('createGame IPFS failed to get JSON. Hash: {}', [ipfsHash.toString()])

      return null
    }

    data = ipfsJson.toObject()

    if (data === null) {
      log.error('createGame IPFS failed to convert to object. Hash: {}', [ipfsHash.toString()])

      return null
    }

  }

  // V3

  if (dataBytes !== null) {

    const dataJson = json.try_fromBytes(dataBytes)

    if (!dataJson.isOk) {
      log.error('createGame bytes data failed to parse json. data: {}', [dataBytes.toString()])

      return null
    }

    data = dataJson.value.toObject()

    if (data === null) {
      log.error('createGame bytes data failed to convert to object. data: {}', [dataBytes.toString()])

      return null
    }

  }

  data = data!

  let sportId: BigInt | null = null

  // V1
  const sportTypeIdField = data.get('sportTypeId')

  if (sportTypeIdField && sportTypeIdField.kind === JSONValueKind.NUMBER) {
    sportId = sportTypeIdField.toBigInt()
  }

  // V2
  const sportIdField = data.get('sportId')

  if (sportIdField && sportIdField.kind === JSONValueKind.NUMBER) {
    sportId = sportIdField.toBigInt()
  }

  if (sportId === null) {
    log.error('createGame sportId is null', [])

    return null
  }

  let countryName = DEFAULT_COUNTRY.toString()

  // V1
  const titleCountryField = data.get('titleCountry')

  if (titleCountryField && titleCountryField.kind === JSONValueKind.STRING) {
    countryName = titleCountryField.toString()
  }

  // V2
  const countryObjectField = data.get('country')

  if (countryObjectField && countryObjectField.kind === JSONValueKind.OBJECT) {
    const countryObject = countryObjectField.toObject()

    const countryObjectNameField = countryObject.get('name')

    if (countryObjectNameField && countryObjectNameField.kind === JSONValueKind.STRING) {
      countryName = countryObjectNameField.toString()
    }
  }

  let leagueName: string | null = null

  // V1
  const titleLeagueField = data.get('titleLeague')

  if (titleLeagueField && titleLeagueField.kind === JSONValueKind.STRING) {
    leagueName = titleLeagueField.toString()
  }

  // V2
  const leagueObjectField = data.get('league')

  if (leagueObjectField && leagueObjectField.kind === JSONValueKind.OBJECT) {
    const leagueObject = leagueObjectField.toObject()

    const leagueObjectNameField = leagueObject.get('name')

    if (leagueObjectNameField && leagueObjectNameField.kind === JSONValueKind.STRING) {
      leagueName = leagueObjectNameField.toString()
    }
  }

  if (leagueName === null) {
    log.error('createGame leagueName is null', [])

    return null
  }

  const sportHubName = sportHubs.get(sportId)

  if (!sportHubName) {
    log.error('createGame sportHubName is null', [])

    return null
  }

  let sportHubEntity = SportHub.load(sportHubName!)

  if (!sportHubEntity) {
    sportHubEntity = new SportHub(sportHubName!)
    sportHubEntity.name = sportHubName!
    sportHubEntity.slug = toSlug(sportHubName!)
    sportHubEntity.save()
  }

  let sportEntity = Sport.load(sportId.toString())

  if (!sportEntity) {
    sportEntity = new Sport(sportId.toString())
    const sportName = sports.get(sportId)

    if (!sportName) {
      log.error('createGame sportName is null', [])

      return null
    }
    sportEntity.sportId = sportId
    sportEntity.name = sportName!
    sportEntity.slug = toSlug(sportName!)

    sportEntity.sporthub = sportHubEntity.id
    sportEntity.save()
  }

  const countryEntityId = sportId.toString().concat('_').concat(countryName)

  let countryEntity = Country.load(countryEntityId)

  if (!countryEntity) {
    countryEntity = new Country(countryEntityId)
    countryEntity.name = countryName
    countryEntity.sport = sportEntity.id
    countryEntity.turnover = BigInt.zero()
    countryEntity.slug = toSlug(countryName)
    countryEntity.hasActiveLeagues = false
    countryEntity.activeLeaguesEntityIds = []
    countryEntity.save()
  }

  let leagueEntityId = getLeagueEntityId(sportId, countryName, leagueName)

  let leagueEntity = League.load(leagueEntityId)

  if (!leagueEntity) {
    leagueEntity = new League(leagueEntityId)
    leagueEntity.name = leagueName
    leagueEntity.country = countryEntity.id
    leagueEntity.slug = toSlug(leagueName)
    leagueEntity.turnover = BigInt.zero()
    leagueEntity.hasActiveGames = false
    leagueEntity.activeGamesEntityIds = []
    leagueEntity.save()
  }

  // V1 - gameId from ipfs
  let gameId = rawGameId

  if (gameId === null) {
    const gameIdObjectField = data.get('gameId')

    if (!gameIdObjectField || gameIdObjectField.kind !== JSONValueKind.NUMBER) {
      log.error('createGame gameIdObjectField is null', [])

      return null
    }

    gameId = gameIdObjectField.toBigInt()
  }
  // end V1 - gameId from ipfs

  // V2
  const extraObjectField = data.get('extra')
  let provider = BigInt.fromString('1')

  if (extraObjectField && extraObjectField.kind === JSONValueKind.OBJECT) {
    const extraObject = extraObjectField.toObject()

    const extraObjectProviderField = extraObject.get('provider')

    if (extraObjectProviderField && extraObjectProviderField.kind === JSONValueKind.NUMBER) {
      provider = extraObjectProviderField.toBigInt()
    }
  }

  const gameEntityId = getGameEntityId(liquidityPoolAddress, gameId.toString())

  let gameEntity = Game.load(gameEntityId)

  if (!gameEntity) {
    gameEntity = new Game(gameEntityId)
    gameEntity.gameId = gameId
    gameEntity.status = GAME_STATUS_CREATED.toString()

    gameEntity.hasActiveConditions = false
    gameEntity._activeConditionsEntityIds = []
    gameEntity._resolvedConditionsEntityIds = []
    gameEntity._canceledConditionsEntityIds = []
    gameEntity._pausedConditionsEntityIds = []

    gameEntity.liquidityPool = liquidityPoolAddress

    gameEntity.league = leagueEntity.id
    gameEntity.startsAt = startsAt
    gameEntity.sport = sportEntity.id

    gameEntity.createdTxHash = txHash

    gameEntity.createdBlockNumber = createBlock.number
    gameEntity.createdBlockTimestamp = createBlock.timestamp
    gameEntity.turnover = BigInt.zero()
    gameEntity.provider = provider
    gameEntity._updatedAt = createBlock.timestamp

    gameEntity.save()
  }

  let participantsNames: string[] = []

  // V1
  for (let i = 0; i <= 1; i++) {
    let participantEntityId = getParticipantEntityId(gameEntity.id, BigInt.fromI32(i).toString())

    let participantNameKey = 'entity'.concat((i + 1).toString()).concat('Name')
    let participantNameValue = data.get(participantNameKey)

    if (!participantNameValue) {
      continue
    }
    const participantName = participantNameValue.toString()

    participantsNames = participantsNames.concat([participantName])

    let participantImageKey = 'entity'.concat((i + 1).toString()).concat('Image')
    let participantImageValue = data.get(participantImageKey)
    const participantImage = participantImageValue && participantImageValue.kind === JSONValueKind.STRING
      ? participantImageValue.toString()
      : null

    let participantEntity = Participant.load(participantEntityId)

    if (!participantEntity) {
      participantEntity = new Participant(participantEntityId)
      participantEntity.game = gameEntity.id
      participantEntity.name = participantName
      participantEntity.image = participantImage
      participantEntity.sortOrder = i
      participantEntity.save()
    }
  }

  // V2
  let participants = data.get('participants')

  if (participants && participants.kind === JSONValueKind.ARRAY) {
    const participantsArray = participants.toArray()

    for (let i = 0; i < participantsArray.length; i++) {
      let participantEntityId = getParticipantEntityId(gameEntity.id, BigInt.fromI32(i).toString())

      const mappedParticipant = participantsArray[i].toObject()

      const participantNameValue = mappedParticipant.get('name')

      if (!participantNameValue) {
        continue
      }

      const participantName = participantNameValue.toString()
      participantsNames = participantsNames.concat([participantName])

      const participantImageValue = mappedParticipant.get('image')
      const participantImage = participantImageValue && participantImageValue.kind === JSONValueKind.STRING
        ? participantImageValue.toString()
        : getImageUrl(network, sportId, gameId, participantName)

      const participantEntity = new Participant(participantEntityId)
      participantEntity.game = gameEntity.id
      participantEntity.name = participantName
      participantEntity.image = participantImage
      participantEntity.sortOrder = i
      participantEntity.save()
    }
  }

  gameEntity.title = participantsNames[0].concat(' - ').concat(participantsNames[1])

  const gameSlug = gameEntity.title!.concat('-').concat(gameEntity.gameId.toString())

  gameEntity.slug = toSlug(gameSlug)
  gameEntity._updatedAt = createBlock.timestamp

  gameEntity.save()

  return gameEntity
}

export function shiftGame(
  gameEntityId: string,
  startsAt: BigInt,
  txHash: string,
  shiftedBlock: ethereum.Block,
): Game | null {
  const gameEntity = Game.load(gameEntityId)

  // TODO remove later
  if (!gameEntity) {
    log.error('shiftGame gameEntity not found. gameEntityId = {}', [gameEntityId])

    return null
  }

  gameEntity.startsAt = startsAt

  gameEntity.shiftedTxHash = txHash

  gameEntity.shiftedBlockNumber = shiftedBlock.number
  gameEntity.shiftedBlockTimestamp = shiftedBlock.timestamp
  gameEntity._updatedAt = shiftedBlock.timestamp

  gameEntity.save()

  return gameEntity
}

export function cancelGame(gameEntityId: string, txHash: string, resolvedBlock: ethereum.Block): Game | null {
  const gameEntity = Game.load(gameEntityId)

  // TODO remove later
  if (!gameEntity) {
    log.error('cancelGame gameEntity not found. gameEntityId = {}', [gameEntityId])

    return null
  }

  gameEntity.resolvedTxHash = txHash

  gameEntity.resolvedBlockNumber = resolvedBlock.number
  gameEntity.resolvedBlockTimestamp = resolvedBlock.timestamp

  gameEntity.status = GAME_STATUS_CANCELED.toString()
  gameEntity._updatedAt = resolvedBlock.timestamp

  gameEntity.save()

  return gameEntity
}
