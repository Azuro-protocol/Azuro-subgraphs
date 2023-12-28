import { TypedMap } from '@graphprotocol/graph-ts'


export const slugOverrides = new TypedMap<string, string>()

slugOverrides.set('league-of-legends', 'lol')
slugOverrides.set('counter-strike-2', 'cs2')
