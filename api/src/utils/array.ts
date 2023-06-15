export function removeItem<T>(arr: Array<T>, value: T): Array<T> {
  const index = arr.indexOf(value)

  if (index > -1) {
    arr.splice(index, 1)
  }

  return arr
}

export function addLeadZerosOrSlice(input: string, digits: i32): string {
  let arr = input.split('').reverse()

  if (arr.length < digits) {
    const newArrayLength = digits - arr.length
    let newArray = new Array(newArrayLength) as string[]

    arr = arr.concat(newArray.fill('0'))
  }
  else {
    arr = arr.slice(0, digits)
  }

  return arr.reverse().join('')
}
