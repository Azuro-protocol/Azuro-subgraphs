import { slugOverrides } from '../dictionaties/slugOverrides'


export function toSlug(input: string): string {
  const arr = input.toLowerCase().trim().split('')
  let prevSpace = false
  let result: string[] = []
  let j = 0

  for (let i = 0; i < arr.length; i++) {
    const letter = arr[i]
    const letterCode = letter.codePointAt(0)

    if (letterCode === 45 || letterCode === 32) {
      // '-' or ' '
      if (prevSpace) {
        // prevent '-' doubling
        continue
      }

      prevSpace = true
      result[j] = '-'
      j = ++j
      continue
    }

    prevSpace = false

    if (
      (letterCode > 47 && letterCode < 58) // 0-9
      || (letterCode > 96 && letterCode < 123) // a-z
    ) {
      result[j] = letter
      j = ++j
    }
  }

  const res = result.join('').trim()

  if (slugOverrides.isSet(res)) {
    return slugOverrides.mustGet(res)
  }

  return res
}
