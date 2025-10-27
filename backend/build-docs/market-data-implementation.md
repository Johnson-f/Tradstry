## Finance Query API Implementation

This package implements the Finance Query API to provide comprehensive financial data and market information.

### API Endpoints

## Market Status
**Endpoint:** `https://finance-query.onrender.com/hours`

**Response:**
```json
{
  "status": "open",
  "reason": "Regular trading hours.",
  "timestamp": "2021-09-22T14:00:00.000Z"
}

# Detailed data for multiple stocks
- endpoint: https://finance-query.onrender.com/v1/quotes?symbols=PSIX%2C%20TSLA <- note the symbols won't be hard coded, it will be dynamically passed in by the user of the package

- response:
```json
[
  {
    "symbol": "TSLA",
    "name": "Tesla, Inc.",
    "price": "413.49",
    "afterHoursPrice": "408.09",
    "change": "-22.05",
    "percentChange": "-5.06%",
    "open": "436.50",
    "high": "443.13",
    "low": "411.45",
    "yearHigh": "488.54",
    "yearLow": "212.11",
    "volume": 106903098,
    "avgVolume": 89455720,
    "marketCap": "1.37T",
    "beta": "2.09",
    "pe": "243.23",
    "earningsDate": "Oct 22, 2025",
    "sector": "Consumer Cyclical",
    "industry": "Auto Manufacturers",
    "about": "Tesla, Inc. designs, develops, manufactures, leases, and sells electric vehicles, and energy generation and storage systems in the United States, China, and internationally. The company operates in two segments, Automotive; and Energy Generation and Storage. The Automotive segment offers electric vehicles, as well as sells automotive regulatory credits; and non-warranty after-sales vehicle, used vehicles, body shop and parts, supercharging, retail merchandise, and vehicle insurance services. This segment also provides sedans and sport utility vehicles through direct and used vehicle sales, a network of Tesla Superchargers, and in-app upgrades; purchase financing and leasing services; services for electric vehicles through its company-owned service locations and Tesla mobile service technicians; and vehicle limited warranties and extended service plans. The Energy Generation and Storage segment engages in the design, manufacture, installation, sale, and leasing of solar energy generation and energy storage products, and related services to residential, commercial, and industrial customers and utilities through its website, stores, and galleries, as well as through a network of channel partners. This segment also provides services and repairs to its energy product customers, including under warranty; and various financing options to its residential customers. The company was formerly known as Tesla Motors, Inc. and changed its name to Tesla, Inc. in February 2017. Tesla, Inc. was incorporated in 2003 and is headquartered in Austin, Texas.",
    "employees": "125665",
    "fiveDaysReturn": "-3.80%",
    "oneMonthReturn": "18.89%",
    "threeMonthReturn": "33.44%",
    "sixMonthReturn": "63.82%",
    "ytdReturn": "2.39%",
    "yearReturn": "73.18%",
    "threeYearReturn": "85.45%",
    "fiveYearReturn": "185.82%",
    "tenYearReturn": "2,710.44%",
    "maxReturn": "32,543.94%",
    "logo": "https://img.logo.dev/ticker/TSLA?token=pk_Xd1Cdye3QYmCOXzcvxhxyw&retina=true"
  },
  {
    "symbol": "PSIX",
    "name": "Power Solutions International, Inc.",
    "price": "85.72",
    "afterHoursPrice": "84.00",
    "change": "-5.46",
    "percentChange": "-5.99%",
    "open": "90.85",
    "high": "95.07",
    "low": "85.51",
    "yearHigh": "121.78",
    "yearLow": "15.30",
    "volume": 872279,
    "avgVolume": 746551,
    "marketCap": "1.97B",
    "beta": "1.53",
    "pe": "17.82",
    "earningsDate": "Nov 06, 2025",
    "sector": "Industrials",
    "industry": "Specialty Industrial Machinery",
    "about": "Power Solutions International, Inc. designs, engineers, manufactures, markets, and sells engines and power systems in the United States, North America, the Pacific Rim, Europe, and internationally. The company offers engine blocks integrated with fuel system parts, as well as completely packaged power systems, that include combinations of front accessory drives, cooling systems, electronic systems, air intake systems, fuel systems, housings, power takeoff systems, exhaust systems, hydraulic systems, enclosures, brackets, hoses, tubes, packaging, telematics, and other assembled componentry. It also designs and manufactures large, custom-engineered integrated electrical power generation systems for standby and prime power applications; sells emission-certified compression ignition and spark-ignition internal combustion engines; and fabricates power system enclosures, as well as sources electrification components. In addition, it provides mobile and stationary gensets for emergency standby, rental, prime power, demand response, microgrid, oil and gas, data center, renewable energy resiliency, and combined heat and power; forklifts, wood chippers, stump grinders, sweepers/industrial scrubbers, aerial lift platforms/scissor lifts, irrigation pumps, oil and gas compression, oil lifts, off road utility vehicles, ground support equipment, ice resurfacing equipment, pump jacks, and battery packs; and vocational trucks and vans, school buses, transit buses, and terminal and utility tractors. Power Solutions International, Inc. was founded in 1985 and is headquartered in Wood Dale, Illinois. Power Solutions International, Inc. is a subsidiary of Weichai America Corp.",
    "employees": "700",
    "fiveDaysReturn": "-7.11%",
    "oneMonthReturn": "-4.38%",
    "threeMonthReturn": "25.34%",
    "sixMonthReturn": "305.49%",
    "ytdReturn": "188.13%",
    "yearReturn": "328.17%",
    "threeYearReturn": "5,614.67%",
    "fiveYearReturn": "1,870.57%",
    "tenYearReturn": "212.96%",
    "maxReturn": "404.24%",
    "logo": "https://img.logo.dev/ticker/PSIX?token=pk_Xd1Cdye3QYmCOXzcvxhxyw&retina=true"
  }
]

# Summary data for multiple stocks
- endpoint: https://finance-query.onrender.com/v1/simple-quotes?symbols=PSIX%2C%20TSLA <- note the symbols won't be hard coded, it will be dynamically passed in by the user of the package

- response:
```json
[
  {
    "symbol": "TSLA",
    "name": "Tesla, Inc.",
    "price": "413.49",
    "afterHoursPrice": "408.09",
    "change": "-22.05",
    "percentChange": "-5.06%",
    "logo": "https://img.logo.dev/ticker/TSLA?token=pk_Xd1Cdye3QYmCOXzcvxhxyw&retina=true"
  },
  {
    "symbol": "PSIX",
    "name": "Power Solutions International, Inc.",
    "price": "85.72",
    "afterHoursPrice": "84.00",
    "change": "-5.46",
    "percentChange": "-5.99%",
    "logo": "https://img.logo.dev/ticker/PSIX?token=pk_Xd1Cdye3QYmCOXzcvxhxyw&retina=true"
  }
]

# Simliar quotes to a queried symbol
- endpoint: https://finance-query.onrender.com/v1/similar?symbol=TSLA <- note the symbol won't be hard coded, it will be dynamically passed in by the user of the package

- response:
```json
[
  {
    "symbol": "AAPL",
    "name": "Apple Inc.",
    "price": "245.27",
    "afterHoursPrice": "245.40",
    "change": "-8.77",
    "percentChange": "-3.45%",
    "logo": "https://img.logo.dev/ticker/AAPL?token=pk_Xd1Cdye3QYmCOXzcvxhxyw&retina=true"
  },
  {
    "symbol": "AMZN",
    "name": "Amazon.com, Inc.",
    "price": "216.37",
    "afterHoursPrice": "215.10",
    "change": "-11.37",
    "percentChange": "-4.99%",
    "logo": "https://img.logo.dev/ticker/AMZN?token=pk_Xd1Cdye3QYmCOXzcvxhxyw&retina=true"
  },
  {
    "symbol": "META",
    "name": "Meta Platforms, Inc.",
    "price": "705.30",
    "afterHoursPrice": "705.47",
    "change": "-28.21",
    "percentChange": "-3.85%",
    "logo": "https://img.logo.dev/ticker/META?token=pk_Xd1Cdye3QYmCOXzcvxhxyw&retina=true"
  },
  {
    "symbol": "GOOG",
    "name": "Alphabet Inc.",
    "price": "237.49",
    "afterHoursPrice": "236.52",
    "change": "-4.72",
    "percentChange": "-1.95%",
    "logo": "https://img.logo.dev/ticker/GOOG?token=pk_Xd1Cdye3QYmCOXzcvxhxyw&retina=true"
  },
  {
    "symbol": "NVDA",
    "name": "NVIDIA Corporation",
    "price": "183.16",
    "afterHoursPrice": "183.20",
    "change": "-9.34",
    "percentChange": "-4.85%",
    "logo": "https://img.logo.dev/ticker/NVDA?token=pk_Xd1Cdye3QYmCOXzcvxhxyw&retina=true"
  },
  {
    "symbol": "NFLX",
    "name": "Netflix, Inc.",
    "price": "1220.08",
    "afterHoursPrice": "1217.00",
    "change": "-10.99",
    "percentChange": "-0.89%",
    "logo": "https://img.logo.dev/ticker/NFLX?token=pk_Xd1Cdye3QYmCOXzcvxhxyw&retina=true"
  },
  {
    "symbol": "MSFT",
    "name": "Microsoft Corporation",
    "price": "510.96",
    "afterHoursPrice": "511.51",
    "change": "-11.44",
    "percentChange": "-2.19%",
    "logo": "https://img.logo.dev/ticker/MSFT?token=pk_Xd1Cdye3QYmCOXzcvxhxyw&retina=true"
  },
  {
    "symbol": "AMD",
    "name": "Advanced Micro Devices, Inc.",
    "price": "214.90",
    "afterHoursPrice": "215.18",
    "change": "-17.99",
    "percentChange": "-7.72%",
    "logo": "https://img.logo.dev/ticker/AMD?token=pk_Xd1Cdye3QYmCOXzcvxhxyw&retina=true"
  },
  {
    "symbol": "DIS",
    "name": "The Walt Disney Company",
    "price": "109.19",
    "afterHoursPrice": "109.19",
    "change": "-1.80",
    "percentChange": "-1.62%",
    "logo": "https://img.logo.dev/ticker/DIS?token=pk_Xd1Cdye3QYmCOXzcvxhxyw&retina=true"
  },
  {
    "symbol": "INTC",
    "name": "Intel Corporation",
    "price": "36.37",
    "afterHoursPrice": "35.67",
    "change": "-1.43",
    "percentChange": "-3.78%",
    "logo": "https://img.logo.dev/ticker/INTC?token=pk_Xd1Cdye3QYmCOXzcvxhxyw&retina=true"
  }
]

# Historical data for a stock
- endpoint: https://finance-query.onrender.com/v1/historical?symbol=&range=1d&interval=1m&epoch=true
<- the symbol won't be hard coded, it will be dynamically passed in by the user of the package

The range and interval will be dynamically passed in by the user of the package
Range & interval can be one of the following:
- 1d 1m
- 5d 5m
- 1mo 15m
- 3mo  30m
- 6mo 1h
- ytd 1d
- 1y 1mo
- 2y
- 5y
- 10y
- max
the epoch will always be true

- response:
```json
{
  "1760103000": {
    "open": 436.5,
    "high": 443.13,
    "low": 433.31,
    "close": 437.05,
    "adjClose": null,
    "volume": 19924512
  },
  "1760106600": {
    "open": 437.1,
    "high": 440.25,
    "low": 423,
    "close": 424.59,
    "adjClose": null,
    "volume": 19593847
  },
  "1760110200": {
    "open": 424.59,
    "high": 426.52,
    "low": 416.01,
    "close": 421.4,
    "adjClose": null,
    "volume": 19462042
  },
  "1760113800": {
    "open": 421.48,
    "high": 422.43,
    "low": 415.44,
    "close": 419.56,
    "adjClose": null,
    "volume": 12629219
  },
  "1760117400": {
    "open": 419.42,
    "high": 420.35,
    "low": 417.17,
    "close": 418.95,
    "adjClose": null,
    "volume": 7677872
  },
  "1760121000": {
    "open": 418.91,
    "high": 419.48,
    "low": 413.37,
    "close": 414.29,
    "adjClose": null,
    "volume": 10345558
  },
  "1760124600": {
    "open": 414.35,
    "high": 416.16,
    "low": 411.45,
    "close": 413.3,
    "adjClose": null,
    "volume": 10787182
  },
  "1760126400": {
    "open": 413.49,
    "high": 413.49,
    "low": 413.49,
    "close": 413.49,
    "adjClose": null,
    "volume": 0
  }
}

# Most active
- endpoint: https://finance-query.onrender.com/v1/actives?count=25

- response:
```json
[
  {
    "symbol": "NVDA",
    "name": "NVIDIA Corporation",
    "price": "183.16",
    "change": "-9.34",
    "percentChange": "-4.85%"
  },
  {
    "symbol": "BBAI",
    "name": "BigBear.ai Holdings, Inc.",
    "price": "7.22",
    "change": "-0.27",
    "percentChange": "-3.60%"
  },
  {
    "symbol": "BITF",
    "name": "Bitfarms Ltd.",
    "price": "4.2000",
    "change": "0.0300",
    "percentChange": "0.72%"
  },
  {
    "symbol": "INTC",
    "name": "Intel Corporation",
    "price": "36.37",
    "change": "-1.43",
    "percentChange": "-3.78%"
  },
  {
    "symbol": "PLUG",
    "name": "Plug Power Inc.",
    "price": "3.4200",
    "change": "-0.3600",
    "percentChange": "-9.52%"
  },
  {
    "symbol": "OPEN",
    "name": "Opendoor Technologies Inc.",
    "price": "7.57",
    "change": "-0.57",
    "percentChange": "-7.00%"
  },
  {
    "symbol": "RGTI",
    "name": "Rigetti Computing, Inc.",
    "price": "43.92",
    "change": "-3.19",
    "percentChange": "-6.77%"
  },
  {
    "symbol": "DNN",
    "name": "Denison Mines Corp.",
    "price": "2.8800",
    "change": "0.0500",
    "percentChange": "1.77%"
  },
  {
    "symbol": "NIO",
    "name": "NIO Inc.",
    "price": "6.71",
    "change": "-0.75",
    "percentChange": "-10.05%"
  },
  {
    "symbol": "AMD",
    "name": "Advanced Micro Devices, Inc.",
    "price": "214.90",
    "change": "-17.99",
    "percentChange": "-7.72%"
  },
  {
    "symbol": "APLD",
    "name": "Applied Digital Corporation",
    "price": "33.99",
    "change": "4.70",
    "percentChange": "16.05%"
  },
  {
    "symbol": "TSLA",
    "name": "Tesla, Inc.",
    "price": "413.49",
    "change": "-22.05",
    "percentChange": "-5.06%"
  },
  {
    "symbol": "SOFI",
    "name": "SoFi Technologies, Inc.",
    "price": "26.19",
    "change": "-2.26",
    "percentChange": "-7.94%"
  },
  {
    "symbol": "F",
    "name": "Ford Motor Company",
    "price": "11.41",
    "change": "-0.09",
    "percentChange": "-0.78%"
  },
  {
    "symbol": "BBD",
    "name": "Banco Bradesco S.A.",
    "price": "3.0600",
    "change": "-0.1300",
    "percentChange": "-4.08%"
  },
  {
    "symbol": "MARA",
    "name": "MARA Holdings, Inc.",
    "price": "18.65",
    "change": "-1.55",
    "percentChange": "-7.67%"
  },
  {
    "symbol": "SNAP",
    "name": "Snap Inc.",
    "price": "7.78",
    "change": "-0.60",
    "percentChange": "-7.16%"
  },
  {
    "symbol": "QS",
    "name": "QuantumScape Corporation",
    "price": "14.70",
    "change": "-0.29",
    "percentChange": "-1.93%"
  },
  {
    "symbol": "AAL",
    "name": "American Airlines Group Inc.",
    "price": "11.52",
    "change": "-0.10",
    "percentChange": "-0.86%"
  },
  {
    "symbol": "WULF",
    "name": "TeraWulf Inc.",
    "price": "13.51",
    "change": "-0.08",
    "percentChange": "-0.59%"
  },
  {
    "symbol": "CIFR",
    "name": "Cipher Mining Inc.",
    "price": "16.97",
    "change": "-1.02",
    "percentChange": "-5.67%"
  },
  {
    "symbol": "IREN",
    "name": "IREN Limited",
    "price": "59.77",
    "change": "-4.08",
    "percentChange": "-6.39%"
  },
  {
    "symbol": "AMZN",
    "name": "Amazon.com, Inc.",
    "price": "216.37",
    "change": "-11.37",
    "percentChange": "-4.99%"
  },
  {
    "symbol": "BMNR",
    "name": "Bitmine Immersion Technologies, Inc.",
    "price": "52.47",
    "change": "-6.63",
    "percentChange": "-11.22%"
  },
  {
    "symbol": "PATH",
    "name": "UiPath Inc.",
    "price": "17.05",
    "change": "-1.46",
    "percentChange": "-7.89%"
  }
]

# Top gainers
- endpoint: https://finance-query.onrender.com/v1/gainers?count=25

- response:
```json
[
  {
    "symbol": "PTGX",
    "name": "Protagonist Therapeutics, Inc.",
    "price": "87.00",
    "change": "19.96",
    "percentChange": "29.77%"
  },
  {
    "symbol": "APLD",
    "name": "Applied Digital Corporation",
    "price": "33.99",
    "change": "4.70",
    "percentChange": "16.05%"
  },
  {
    "symbol": "NAMS",
    "name": "NewAmsterdam Pharma Company N.V.",
    "price": "37.05",
    "change": "4.05",
    "percentChange": "12.26%"
  },
  {
    "symbol": "MP",
    "name": "MP Materials Corp.",
    "price": "78.34",
    "change": "6.05",
    "percentChange": "8.37%"
  },
  {
    "symbol": "UEC",
    "name": "Uranium Energy Corp.",
    "price": "14.65",
    "change": "1.10",
    "percentChange": "8.12%"
  },
  {
    "symbol": "PPTA",
    "name": "Perpetua Resources Corp.",
    "price": "25.79",
    "change": "1.85",
    "percentChange": "7.73%"
  },
  {
    "symbol": "MLYS",
    "name": "Mineralys Therapeutics, Inc.",
    "price": "42.16",
    "change": "2.77",
    "percentChange": "7.03%"
  },
  {
    "symbol": "OKLO",
    "name": "Oklo Inc.",
    "price": "147.16",
    "change": "9.03",
    "percentChange": "6.54%"
  },
  {
    "symbol": "ESTC",
    "name": "Elastic N.V.",
    "price": "86.48",
    "change": "4.93",
    "percentChange": "6.05%"
  },
  {
    "symbol": "USAR",
    "name": "USA Rare Earth, Inc.",
    "price": "32.61",
    "change": "1.54",
    "percentChange": "4.96%"
  },
  {
    "symbol": "PCVX",
    "name": "Vaxcyte, Inc.",
    "price": "43.70",
    "change": "1.71",
    "percentChange": "4.07%"
  },
  {
    "symbol": "PEP",
    "name": "PepsiCo, Inc.",
    "price": "150.08",
    "change": "5.37",
    "percentChange": "3.71%"
  },
  {
    "symbol": "ABVX",
    "name": "ABIVAX Société Anonyme",
    "price": "93.77",
    "change": "3.16",
    "percentChange": "3.49%"
  },
  {
    "symbol": "UUUU",
    "name": "Energy Fuels Inc.",
    "price": "20.34",
    "change": "0.64",
    "percentChange": "3.25%"
  },
  {
    "symbol": "CALM",
    "name": "Cal-Maine Foods, Inc.",
    "price": "94.43",
    "change": "2.88",
    "percentChange": "3.15%"
  },
  {
    "symbol": "BIPC",
    "name": "Brookfield Infrastructure Corporation",
    "price": "45.28",
    "change": "1.36",
    "percentChange": "3.10%"
  },
  {
    "symbol": "BCPC",
    "name": "Balchem Corporation",
    "price": "144.64",
    "change": "4.34",
    "percentChange": "3.09%"
  },
  {
    "symbol": "PLBL",
    "name": "Polibeli Group Ltd",
    "price": "8.45",
    "change": "0.25",
    "percentChange": "3.05%"
  },
  {
    "symbol": "MKTX",
    "name": "MarketAxess Holdings Inc.",
    "price": "177.40",
    "change": "5.17",
    "percentChange": "3.00%"
  }
]

# Top losers
- endpoint: https://finance-query.onrender.com/v1/losers?count=25

- response:
```json
[
  {
    "symbol": "VG",
    "name": "Venture Global, Inc.",
    "price": "9.45",
    "change": "-3.13",
    "percentChange": "-24.88%"
  },
  {
    "symbol": "DGNX",
    "name": "Diginex Limited",
    "price": "24.93",
    "change": "-6.46",
    "percentChange": "-20.58%"
  },
  {
    "symbol": "CORT",
    "name": "Corcept Therapeutics Incorporated",
    "price": "73.96",
    "change": "-14.40",
    "percentChange": "-16.30%"
  },
  {
    "symbol": "WRD",
    "name": "WeRide Inc.",
    "price": "10.17",
    "change": "-1.80",
    "percentChange": "-15.04%"
  },
  {
    "symbol": "AMBA",
    "name": "Ambarella, Inc.",
    "price": "72.88",
    "change": "-11.40",
    "percentChange": "-13.53%"
  },
  {
    "symbol": "BTDR",
    "name": "Bitdeer Technologies Group",
    "price": "17.78",
    "change": "-2.73",
    "percentChange": "-13.31%"
  },
  {
    "symbol": "GDS",
    "name": "GDS Holdings Limited",
    "price": "33.31",
    "change": "-5.11",
    "percentChange": "-13.30%"
  },
  {
    "symbol": "LEVI",
    "name": "Levi Strauss & Co.",
    "price": "21.46",
    "change": "-3.08",
    "percentChange": "-12.55%"
  },
  {
    "symbol": "CGNX",
    "name": "Cognex Corporation",
    "price": "40.78",
    "change": "-5.79",
    "percentChange": "-12.43%"
  },
  {
    "symbol": "FLNC",
    "name": "Fluence Energy, Inc.",
    "price": "13.09",
    "change": "-1.81",
    "percentChange": "-12.15%"
  },
  {
    "symbol": "ONDS",
    "name": "Ondas Holdings Inc.",
    "price": "9.22",
    "change": "-1.27",
    "percentChange": "-12.10%"
  },
  {
    "symbol": "FIGR",
    "name": "Figure Technology Solutions, Inc.",
    "price": "42.25",
    "change": "-5.78",
    "percentChange": "-12.03%"
  },
  {
    "symbol": "CRCL",
    "name": "Circle Internet Group",
    "price": "132.94",
    "change": "-17.54",
    "percentChange": "-11.66%"
  },
  {
    "symbol": "ENTG",
    "name": "Entegris, Inc.",
    "price": "83.64",
    "change": "-10.59",
    "percentChange": "-11.24%"
  },
  {
    "symbol": "BMNR",
    "name": "Bitmine Immersion Technologies, Inc.",
    "price": "52.47",
    "change": "-6.63",
    "percentChange": "-11.22%"
  },
  {
    "symbol": "ONTO",
    "name": "Onto Innovation Inc.",
    "price": "121.34",
    "change": "-15.26",
    "percentChange": "-11.17%"
  },
  {
    "symbol": "VNET",
    "name": "VNET Group, Inc.",
    "price": "8.51",
    "change": "-1.07",
    "percentChange": "-11.17%"
  },
  {
    "symbol": "FUTU",
    "name": "Futu Holdings Limited",
    "price": "154.60",
    "change": "-19.40",
    "percentChange": "-11.15%"
  },
  {
    "symbol": "HSAI",
    "name": "Hesai Group",
    "price": "22.05",
    "change": "-2.75",
    "percentChange": "-11.09%"
  },
  {
    "symbol": "ACMR",
    "name": "ACM Research, Inc.",
    "price": "36.59",
    "change": "-4.48",
    "percentChange": "-10.91%"
  },
  {
    "symbol": "KC",
    "name": "Kingsoft Cloud Holdings Limited",
    "price": "12.63",
    "change": "-1.53",
    "percentChange": "-10.84%"
  },
  {
    "symbol": "QUBT",
    "name": "Quantum Computing Inc.",
    "price": "19.01",
    "change": "-2.31",
    "percentChange": "-10.81%"
  },
  {
    "symbol": "ELF",
    "name": "e.l.f. Beauty, Inc.",
    "price": "129.69",
    "change": "-15.28",
    "percentChange": "-10.54%"
  },
  {
    "symbol": "CIVI",
    "name": "Civitas Resources, Inc.",
    "price": "29.48",
    "change": "-3.46",
    "percentChange": "-10.50%"
  },
  {
    "symbol": "SITM",
    "name": "SiTime Corporation",
    "price": "277.65",
    "change": "-32.29",
    "percentChange": "-10.42%"
  }
]

# Market NEWS - both stock specifc and general
- endpoint: https://finance-query.onrender.com/v1/news <- this endpoint is for fetching general market news
- while this endpoint is for fetching stock specific NEWS: https://finance-query.onrender.com/v1/news?symbol=TSLA <- note the symbol won't be hard coded, it will be dynamically passed in by the user of the package

- response:
```json
[
  {
    "title": "Tech megacaps lose $770 billion in value as Nasdaq suffers steepest drop since April",
    "link": "https://www.cnbc.com/2025/10/10/tech-megacaps-market-cap-mag-7.html",
    "source": "CNBC",
    "img": "https://cdn.snapi.dev/images/v1/e/y/s/catalog-mail4-3324076.jpg",
    "time": "1 day ago"
  },
  {
    "title": "The Score: Delta, AMD, Tesla and More Stocks That Defined the Week",
    "link": "https://www.wsj.com/finance/stocks/delta-amd-tesla-pepsi-ford-serve-robotics-0991e881",
    "source": "WSJ",
    "img": "https://cdn.snapi.dev/images/v1/s/c/n/ksnckw-2903661-3324071.jpg",
    "time": "1 day ago"
  },
  {
    "title": "Wall Street sinks after Trump tariff threats, S&P, Nasdaq, Nvidia and Tesla plunge",
    "link": "https://invezz.com/news/2025/10/10/wall-street-sinks-after-trump-tariff-threats-sp-nasdaq-nvidia-and-tesla-plunge/?utm_source=snapi",
    "source": "Invezz",
    "img": "https://cdn.snapi.dev/images/v1/6/9/s/dlm22-2697896-3323924.jpg",
    "time": "1 day ago"
  },
  {
    "title": "Tesla's 'Model 2' Is Here - What Does It Mean Ahead Of Earnings?",
    "link": "https://stockanalysis.com/out/news?url=https://seekingalpha.com/article/4829141-tesla-model-2-what-does-it-mean-ahead-of-earnings",
    "source": "Seeking Alpha",
    "img": "https://cdn.snapi.dev/images/v1/8/6/g/tsla31-2685504-3323609.jpg",
    "time": "1 day ago"
  },
  {
    "title": "Tesla stock seesaws on Friday: here's why",
    "link": "https://invezz.com/news/2025/10/10/tesla-stock-seesaws-on-friday-heres-why/?utm_source=snapi",
    "source": "Invezz",
    "img": "https://cdn.snapi.dev/images/v1/n/i/t/tsla21-2686644-3323532.jpg",
    "time": "1 day ago"
  },
  {
    "title": "Tesla prices standard Model Y at $41,700 in Norway, its website shows",
    "link": "https://www.reuters.com/business/retail-consumer/tesla-prices-standard-model-y-41700-norway-its-website-shows-2025-10-10/",
    "source": "Reuters",
    "img": "https://cdn.snapi.dev/images/v1/n/k/v/tsla22-2686600-3323480.jpg",
    "time": "1 day ago"
  },
  {
    "title": "TSLA, PLTR and SMCI Forecast – Major Stocks Looking for Momentum at Friday Open",
    "link": "https://www.fxempire.com/forecasts/article/tsla-pltr-and-scmi-forecast-major-stocks-looking-for-momentum-at-friday-open-1554060",
    "source": "FXEmpire",
    "img": "https://cdn.snapi.dev/images/v1/i/a/5/software30-3323230.jpg",
    "time": "1 day ago"
  },
  {
    "title": "Tesla's China sales surge signals shift in strategy as EV price war tightens",
    "link": "https://invezz.com/news/2025/10/10/teslas-china-sales-surge-signals-shift-in-strategy-as-ev-price-war-tightens/?utm_source=snapi",
    "source": "Invezz",
    "img": "https://cdn.snapi.dev/images/v1/w/z/i/bgt433er-2691629-3323057.jpg",
    "time": "1 day ago"
  },
  {
    "title": "Tesla Stock Rises. The Reviews Are in on Its New Cars—What Investors Should Care About.",
    "link": "https://www.barrons.com/articles/tesla-stock-new-car-reviews-de6317d3",
    "source": "Barrons",
    "img": "https://cdn.snapi.dev/images/v1/f/p/4/tsla42-2682563-3322894.jpg",
    "time": "2 days ago"
  },
  {
    "title": "Tesla's September China-made EV sales rise 2.8% year on year",
    "link": "https://www.reuters.com/business/autos-transportation/teslas-september-china-made-ev-sales-rise-28-year-year-2025-10-10/",
    "source": "Reuters",
    "img": "https://cdn.snapi.dev/images/v1/a/s/s/433erf-2678659-3322741.jpg",
    "time": "2 days ago"
  },
  {
    "title": "Tesla doesn't usually advertise its cars, but it's spending on ads to promote Elon Musk's $1 trillion pay package",
    "link": "https://www.businessinsider.com/tesla-spends-on-ads-promote-elon-musks-trillion-pay-package-2025-10",
    "source": "Business Insider",
    "img": "https://cdn.snapi.dev/images/v1/q/q/s/tsla20-2686924-3322732.jpg",
    "time": "2 days ago"
  },
  {
    "title": "Stock market lulls as Tesla slides and Delta soars",
    "link": "https://www.fastcompany.com/91419607/market-lulls-tesla-delta",
    "source": "Fast Company",
    "img": "https://cdn.snapi.dev/images/v1/l/m/y/dk22df-2681981-3322437.jpg",
    "time": "2 days ago"
  },
  {
    "title": "Tesla Self-Driving Technology Breaks Traffic Laws. Can the Feds Stop It?",
    "link": "https://www.wsj.com/business/autos/tesla-self-driving-technology-breaks-traffic-laws-can-the-feds-stop-it-a2a78a4d",
    "source": "WSJ",
    "img": "https://cdn.snapi.dev/images/v1/a/l/g/fe22e-2480900-3322411.jpg",
    "time": "2 days ago"
  },
  {
    "title": "Tesla faces U.S. auto safety probe after reports FSD ran red lights, caused collisions",
    "link": "https://www.cnbc.com/2025/10/09/tesla-auto-safety-probe-fsd-collisions.html",
    "source": "CNBC",
    "img": "https://cdn.snapi.dev/images/v1/c/u/s/tsla30-2685529-3322150.jpg",
    "time": "2 days ago"
  },
  {
    "title": "Feds probe nearly 3M Teslas after crashes linked to self-driving tech",
    "link": "https://nypost.com/2025/10/09/business/elon-musks-tesla-probed-for-full-self-driving-impacting-nearly-3m-cars/",
    "source": "New York Post",
    "img": "https://cdn.snapi.dev/images/v1/m/t/p/tsla11-2688370-3321803.jpg",
    "time": "2 days ago"
  },
  {
    "title": "Tesla's Full Self-Driving is in U.S. regulator's sights. The stock is dropping.",
    "link": "https://www.marketwatch.com/story/teslas-full-self-driving-is-in-u-s-regulators-sights-the-stock-is-dropping-f374805d",
    "source": "Market Watch",
    "img": "https://cdn.snapi.dev/images/v1/k/k/f/tsla43-2682437-3321675.jpg",
    "time": "2 days ago"
  },
  {
    "title": "Tesla registers plans for longer-range 'Model Y+' in China",
    "link": "https://www.reuters.com/business/autos-transportation/tesla-registers-plans-longer-range-model-y-china-2025-10-09/",
    "source": "Reuters",
    "img": "https://cdn.snapi.dev/images/v1/a/0/z/tsla37-2683624-3321661.jpg",
    "time": "2 days ago"
  },
  {
    "title": "Tesla Faces Investigation Over Reports Full-Self Driving Runs Red Lights",
    "link": "https://www.forbes.com/sites/zacharyfolk/2025/10/09/tesla-faces-investigation-over-reports-full-self-driving-runs-red-lights/",
    "source": "Forbes",
    "img": "https://cdn.snapi.dev/images/v1/k/e/j/tesla-faces-investigation-over-3321581.jpg",
    "time": "2 days ago"
  },
  {
    "title": "Why Tesla stock is sliding around 2% on Thursday",
    "link": "https://invezz.com/news/2025/10/09/why-tesla-stock-is-sliding-around-2-on-thursday/?utm_source=snapi",
    "source": "Invezz",
    "img": "https://cdn.snapi.dev/images/v1/u/d/u/tsla22-2686600-3321515.jpg",
    "time": "2 days ago"
  },
  {
    "title": "Tesla's ‘Full Self-Driving' software under investigation for traffic safety violations",
    "link": "https://techcrunch.com/2025/10/09/teslas-full-self-driving-software-under-investigation-for-traffic-safety-violations/",
    "source": "TechCrunch",
    "img": "https://cdn.snapi.dev/images/v1/y/f/d/tsla26-2686212-3321018.jpg",
    "time": "3 days ago"
  },
  {
    "title": "US regulators launch investigation into self-driving Teslas after series of crashes",
    "link": "https://www.theguardian.com/technology/2025/oct/09/tesla-cars-self-driving-us-regulators-investigation",
    "source": "The Guardian",
    "img": "https://cdn.snapi.dev/images/v1/w/8/6/tsla23-2686618-3321169.jpg",
    "time": "3 days ago"
  },
  {
    "title": "Musk's record Tesla package will pay him tens of billions even if he misses most goals",
    "link": "https://www.reuters.com/legal/transactional/musks-record-tesla-package-will-pay-him-tens-billions-even-if-he-misses-most-2025-10-09/",
    "source": "Reuters",
    "img": "https://cdn.snapi.dev/images/v1/a/q/r/tsla51-2701803-3320648.jpg",
    "time": "3 days ago"
  }
]

# Sector performance
- endpoint: https://finance-query.onrender.com/v1/sectors

- response:
```json
[
  {
    "sector": "Technology",
    "dayReturn": "-0.69%",
    "ytdReturn": "-2.36%",
    "yearReturn": "+24.00%",
    "threeYearReturn": "+50.20%",
    "fiveYearReturn": "+158.41%"
  },
  {
    "sector": "Healthcare",
    "dayReturn": "+0.87%",
    "ytdReturn": "+7.45%",
    "yearReturn": "+4.04%",
    "threeYearReturn": "+7.59%",
    "fiveYearReturn": "+44.74%"
  },
  {
    "sector": "Financial Services",
    "dayReturn": "+0.81%",
    "ytdReturn": "+5.94%",
    "yearReturn": "+30.86%",
    "threeYearReturn": "+26.28%",
    "fiveYearReturn": "+63.57%"
  },
  {
    "sector": "Consumer Cyclical",
    "dayReturn": "-2.59%",
    "ytdReturn": "+1.55%",
    "yearReturn": "+27.74%",
    "threeYearReturn": "+19.39%",
    "fiveYearReturn": "+102.42%"
  },
  {
    "sector": "Industrials",
    "dayReturn": "+0.08%",
    "ytdReturn": "+3.06%",
    "yearReturn": "+12.32%",
    "threeYearReturn": "+24.85%",
    "fiveYearReturn": "+57.96%"
  },
  {
    "sector": "Consumer Defensive",
    "dayReturn": "+0.74%",
    "ytdReturn": "+3.47%",
    "yearReturn": "+15.60%",
    "threeYearReturn": "+15.16%",
    "fiveYearReturn": "+39.80%"
  },
  {
    "sector": "Energy",
    "dayReturn": "-1.13%",
    "ytdReturn": "+4.96%",
    "yearReturn": "+10.88%",
    "threeYearReturn": "+25.30%",
    "fiveYearReturn": "+61.17%"
  },
  {
    "sector": "Real Estate",
    "dayReturn": "+1.26%",
    "ytdReturn": "+2.33%",
    "yearReturn": "+14.11%",
    "threeYearReturn": "-3.16%",
    "fiveYearReturn": "+14.27%"
  },
  {
    "sector": "Utilities",
    "dayReturn": "+2.06%",
    "ytdReturn": "+4.73%",
    "yearReturn": "+37.61%",
    "threeYearReturn": "+23.87%",
    "fiveYearReturn": "+31.59%"
  },
  {
    "sector": "Basic Materials",
    "dayReturn": "-0.47%",
    "ytdReturn": "+6.16%",
    "yearReturn": "+9.99%",
    "threeYearReturn": "+8.52%",
    "fiveYearReturn": "+53.48%"
  },
  {
    "sector": "Communication Services",
    "dayReturn": "-4.61%",
    "ytdReturn": "+5.72%",
    "yearReturn": "+30.47%",
    "threeYearReturn": "+29.44%",
    "fiveYearReturn": "+73.06%"
  }
]
```

# Symbol search
- endpoint: https://finance-query.onrender.com/v1/search?query=TSLA&hits=10&yahoo=true' <- note the query won't be hard coded, it will be dynamically passed in by the user of the package
- hits default should be 10, while yahoo should permanently be true

- response:
```json
[
  {
    "name": "Tesla, Inc.",
    "symbol": "TSLA",
    "exchange": "NMS",
    "type": "stock"
  },
  {
    "name": "Direxion Daily TSLA Bull 2X Sha",
    "symbol": "TSLL",
    "exchange": "NGM",
    "type": "etf"
  },
  {
    "name": "Tidal ETF Trust II YieldMax TSL",
    "symbol": "TSLY",
    "exchange": "PCX",
    "type": "etf"
  },
  {
    "name": "Tradr 2X Short TSLA Daily ETF",
    "symbol": "TSLQ",
    "exchange": "NGM",
    "type": "etf"
  },
  {
    "name": "GraniteShares YieldBOOST TSLA E",
    "symbol": "TSYY",
    "exchange": "NGM",
    "type": "etf"
  },
  {
    "name": "TESLA, INC. CDR (CAD HEDGED)",
    "symbol": "TSLA.NE",
    "exchange": "NEO",
    "type": "stock"
  },
  {
    "name": "Direxion Daily TSLA Bear 1X Sha",
    "symbol": "TSLS",
    "exchange": "NGM",
    "type": "etf"
  }
]
