# SGE Price Provider Configuration

## Overview

The app uses a multi-provider system to fetch Shanghai Gold Exchange (SGE) silver prices with automatic fallback:

1. **Provider A: Metals-API** (Preferred)
2. **Provider B: TwelveData** (Fallback)
3. **Provider C: Manual ENV** (Override)
4. **Provider D: COMEX + Premium** (Estimation)

## Environment Variables

### Provider A: Metals-API

```bash
METALS_API_KEY=your_metals_api_key_here
```

- **Required**: Yes (for Provider A)
- **Provider**: https://metals-api.com
- **Free Tier**: 50 requests/month
- **Symbol**: XAG/CNY (Silver in Chinese Yuan)
- **Accuracy**: High - direct market data

### Provider B: TwelveData

```bash
TWELVE_DATA_API_KEY=your_twelve_data_key_here
```

- **Required**: Optional (fallback)
- **Provider**: https://twelvedata.com
- **Free Tier**: 800 requests/day
- **Symbol**: XAG/USD (Silver in US Dollars)
- **Accuracy**: High - converted to CNY using FX rate

### Provider C: Manual Override

```bash
SGE_MANUAL_PRICE_CNY_G=5.5
```

- **Required**: Optional (manual override)
- **Unit**: CNY per gram
- **Use Case**: When APIs are down or for testing
- **Example**: `5.5` = 5.5 CNY per gram of silver

### Provider D: COMEX + Premium

```bash
SGE_PREMIUM_PERCENT=3
```

- **Required**: Optional (default: 3%)
- **Default**: 3% premium over COMEX spot
- **Range**: Typical 2-5%
- **Use Case**: When all other providers fail
- **Note**: Marked as `isEstimated=true`

## Validation Settings

```bash
# Silver price plausibility range (USD/oz)
SILVER_MIN_PRICE=10
SILVER_MAX_PRICE=200
```

## Debug Mode

```bash
# Enable debug endpoint /api/debug/prices
DEBUG_PRICES=1
```

When enabled, visit:
```
https://your-app.vercel.app/api/debug/prices
```

Returns detailed conversion steps, raw data, and provider info.

## Conversion Logic

### CNY/gram → USD/oz

```
usd_per_oz = (cny_per_gram × 31.1034768) / fx_usdcny
```

### CNY/kg → USD/oz

```
usd_per_oz = (cny_per_kg / 1000 × 31.1034768) / fx_usdcny
```

### USD/oz → CNY/gram

```
cny_per_gram = (usd_per_oz × fx_usdcny) / 31.1034768
```

## Provider Priority

The system tries providers in order:

1. **Metals-API** → If METALS_API_KEY is set
2. **TwelveData** → If TWELVE_DATA_API_KEY is set
3. **Manual ENV** → If SGE_MANUAL_PRICE_CNY_G is set
4. **COMEX + Premium** → If COMEX price is available

Each provider is validated for plausibility (10-200 USD/oz range).

## Troubleshooting

### SGE Price showing ~32 USD/oz (wrong)

**Possible causes:**
- Using gold price instead of silver
- Unit confusion (g vs oz)
- Currency confusion (CNY vs USD)
- Wrong symbol (XAU instead of XAG)

**Solution:**
1. Check debug endpoint: `/api/debug/prices`
2. Review `conversionSteps` in response
3. Verify API keys are correct
4. Check FX rate is reasonable (USD/CNY ~7.2)

### SGE Price showing as "estimated"

This means Provider D (COMEX + Premium) was used because:
- No API keys configured
- APIs are down/rate-limited
- Manual override is set

**Solution:**
- Configure METALS_API_KEY or TWELVE_DATA_API_KEY
- Or accept estimation if APIs are not available

### All providers failing

**Check:**
1. API keys are valid
2. API rate limits not exceeded
3. Network connectivity
4. FX rate is available
5. Debug logs in Vercel function logs

## Example Configurations

### Production (Metals-API primary)

```bash
METALS_API_KEY=abc123...
TWELVE_DATA_API_KEY=xyz789...  # Fallback
SILVER_MIN_PRICE=15
SILVER_MAX_PRICE=150
SGE_PREMIUM_PERCENT=3
```

### Development (Manual override)

```bash
SGE_MANUAL_PRICE_CNY_G=5.8
DEBUG_PRICES=1
```

### Estimation Only (No APIs)

```bash
SGE_PREMIUM_PERCENT=3.5  # Will use COMEX + 3.5%
```

## Data Storage

SGE prices are stored with:
- `priceCnyPerGram` - Price in CNY per gram
- `priceUsdPerOz` - Price in USD per troy ounce
- `fxRateUsed` - USD/CNY rate used for conversion
- `source` - Which provider was used
- `isEstimated` - Whether this is an estimation (bool)

## API Response Format

### /api/debug/prices

```json
{
  "success": true,
  "result": {
    "priceUsdPerOz": 32.50,
    "priceCnyPerGram": 7.45,
    "source": "Metals-API (XAG/CNY)",
    "isEstimated": false
  },
  "conversionSteps": [
    "API Request: GET metals-api.com/api/latest?base=CNY&symbols=XAG",
    "Raw response: 1 CNY = 0.0043 oz XAG",
    "Inverted: 1 oz XAG = 232.56 CNY",
    "Convert to grams: 232.56 / 31.1034768 = 7.4756 CNY/g",
    "Convert to USD/oz: (7.4756 * 31.1034768) / 7.2 = 32.30 USD/oz"
  ],
  "rawData": {
    "price": 0.0043,
    "currency": "CNY",
    "unit": "oz",
    "source": "Metals-API",
    "symbol": "XAG/CNY"
  }
}
```
