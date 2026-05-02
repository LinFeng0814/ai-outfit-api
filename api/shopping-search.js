/**
 * Vercel Serverless Function
 * 百度图像搜索 API 中转服务
 */

const BAIDU_CONFIG = {
  API_KEY: 'qSCeWfFt7F1tIDuzSt6ETGLT',
  SECRET_KEY: 'WXTtC2vS2bHneSOJI2PDHaXANrVNsjgt',
  TOKEN_URL: 'https://aip.baidubce.com/oauth/2.0/token',
  SEARCH_URL: 'https://aip.baidubce.com/rpc/2.0/ai_custom/v1/taocan_item_search'
};

let cachedToken = null;
let tokenExpire = 0;

async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpire) {
    return cachedToken;
  }

  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: BAIDU_CONFIG.API_KEY,
    client_secret: BAIDU_CONFIG.SECRET_KEY
  });

  const response = await fetch(`${BAIDU_CONFIG.TOKEN_URL}?${params.toString()}`);
  const data = await response.json();

  if (data.access_token) {
    cachedToken = data.access_token;
    tokenExpire = Date.now() + (data.expires_in - 86400) * 1000;
    return cachedToken;
  } else {
    throw new Error('获取 access_token 失败: ' + JSON.stringify(data));
  }
}

function parseProducts(result, type) {
  if (!result || !result.item_list) return [];
  return result.item_list.slice(0, 6).map((item, index) => ({
    id: `bd_${index}`,
    title: item.product_name || item.short_name || '商品',
    price: item.price_info?.price || item.price || '暂无',
    originalPrice: item.price_info?.original_price || '',
    platform: item.platform_name || '电商平台',
    shop: item.shop_name || '店铺',
    sales: item.sales || '',
    rating: item.rating || '',
    img: item.image_url || item.img_url || `https://picsum.photos/seed/clothing-${type}-${index}/200/200`,
    url: item.detail_url || '',
    tags: item.tags || []
  }));
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: '只支持 POST 请求' });
  }

  const { keyword, type = 'top' } = req.body;

  if (!keyword) {
    return res.status(400).json({ success: false, error: 'keyword 不能为空' });
  }

  try {
    const accessToken = await getAccessToken();

    const searchResponse = await fetch(`${BAIDU_CONFIG.SEARCH_URL}?access_token=${accessToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: keyword, pn: 0, rn: 6 })
    });

    const searchData = await searchResponse.json();

    if (searchData.error_code) {
      return res.status(500).json({
        success: false,
        error: searchData.error_msg || '搜索失败'
      });
    }

    const products = parseProducts(searchData.result || {}, type);

    return res.status(200).json({
      success: true,
      keyword,
      products,
      source: 'baidu',
      total: products.length
    });

  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message || '服务异常'
    });
  }
}
