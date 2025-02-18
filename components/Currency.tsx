"use client"

import { useEffect, useState } from "react"

export function Currency() {
  const [currency, setCurrency] = useState("USD")
  const [symbol, setSymbol] = useState("$")
  const [price] = useState(10) 

  useEffect(() => {
    async function fetchLocation() {
      const response = await fetch("/api/location")
      const data = await response.json()
      setCurrency(data.currency)
      setSymbol(data.symbol)
    }

    fetchLocation()
  }, [])

  return (
    <div className="text-2xl">
      Price: {symbol}
      {price} {currency}
    </div>
  )
}

