import LambdaFunction from './LambdaFunction.js'

export default class LambdaFunctionPool {
  #options = null
  #pool = new Map()
  #serverless = null
  #timerRef = null

  constructor(serverless, options) {
    this.#options = options
    this.#serverless = serverless

    // start cleaner
    this._startCleanTimer()
  }

  _startCleanTimer() {
    // NOTE: don't use setInterval, as it would schedule always a new run,
    // regardless of function processing time and e.g. user action (debugging)
    this.#timerRef = setTimeout(() => {
      // console.log('run cleanup')
      this.#pool.forEach((lambdaFunctions) => {
        lambdaFunctions.forEach((lambdaFunction) => {
          const { idleTimeInMinutes, status } = lambdaFunction
          // console.log(idleTimeInMinutes, status)

          // 45 // TODO config, or maybe option?
          if (status === 'IDLE' && idleTimeInMinutes >= 1) {
            // console.log(`removed Lambda Function ${lambdaFunction.functionName}`)
            lambdaFunctions.delete(lambdaFunction)
          }
        })
      })

      // schedule new timer
      this._startCleanTimer()
    }, 10000) // TODO: config, or maybe option?
  }

  _cleanupPool() {
    const wait = []

    this.#pool.forEach((lambdaFunctions) => {
      lambdaFunctions.forEach((lambdaFunction) => {
        // collect promises
        wait.push(lambdaFunction.cleanup())
        lambdaFunctions.delete(lambdaFunction)
      })
    })

    return Promise.all(wait)
  }

  // TODO make sure to call this
  async cleanup() {
    clearTimeout(this.#timerRef)

    return this._cleanupPool()
  }

  get(functionKey, functionDefinition) {
    const lambdaFunctions = this.#pool.get(functionKey)
    let lambdaFunction

    // we don't have any instances
    if (lambdaFunctions == null) {
      lambdaFunction = new LambdaFunction(
        functionKey,
        functionDefinition,
        this.#serverless,
        this.#options,
      )
      this.#pool.set(functionKey, new Set([lambdaFunction]))

      return lambdaFunction
    }

    // console.log(`${lambdaFunctions.size} lambdaFunctions`)

    // find any IDLE ones
    lambdaFunction = Array.from(lambdaFunctions).find(
      ({ status }) => status === 'IDLE',
    )

    // we don't have any IDLE instances
    if (lambdaFunction == null) {
      lambdaFunction = new LambdaFunction(
        functionKey,
        functionDefinition,
        this.#serverless,
        this.#options,
      )
      lambdaFunctions.add(lambdaFunction)

      // console.log(`${lambdaFunctions.size} lambdaFunctions`)

      return lambdaFunction
    }

    return lambdaFunction
  }
}
