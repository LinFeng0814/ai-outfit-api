/**
 * Vercel Serverless Function
 * 百度图像搜索 API 中转服务（以图搜图）
 */

// ============ 百度图像搜索配置 ============
const BAIDU_CONFIG = {
  API_KEY: 'qSCeWfFt7F1tIDuzSt6ETGLT',
  SECRET_KEY: 'WXTtC2vS2bHneSOJI2PDHaXANrVNsjgt',
  TOKEN_URL: 'https://aip.baidubce.com/oauth/2.0/token',
  // 相同图检索API
  SEARCH_URL: 'https://aip.baidubce.com/rest/2.0/image-search/v1/product/search'
};

// 缓存 access_token
let cachedToken = null;
let tokenExpire = 0;

/**
 * 获取百度 access_token
 */
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
    console.log('[百度] Token获取成功');
    return cachedToken;
  } else {
    throw new Error('获取 access_token 失败: ' + JSON.stringify(data));
  }
}

/**
 * 解析百度返回的商品数据
 */
function parseProducts(result) {
  if (!result || !result.result) {
    console.log('[百度] 无搜索结果');
    return [];
  }
  
  const items = result.result;
  if (!items || !Array.isArray(items)) return [];
  
  return items.slice(0, 6).map((item, index) => ({
    id: `bd_${index}`,
    title: item.brief || item.product_name || '相似商品',
    price: item.price ? (item.price / 100).toFixed(2) : '暂无',
    originalPrice: '',
    platform: item.source || '电商平台',
    shop: item.shop_name || '',
    sales: '',
    rating: '',
    img: item.thumb_url || item.image_url || `https://picsum.photos/seed/search-${index}/200/200`,
    url: item.page_url || '',
    tags: []
  }));
}

/**
 * Vercel Serverless Function 入口
 */
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

  const { imageBase64 } = req.body || {};

  if (!imageBase64) {
    return res.status(400).json({ success: false, error: 'imageBase64 不能为空' });
  }

  try {
    console.log('[百度] 开始以图搜图');

    // 1. 获取 access_token
    const accessToken = await getAccessToken();

    // 2. 调用百度图像搜索 API
    const searchResponse = await fetch(`${BAIDU_CONFIG.SEARCH_URL}?access_token=${accessToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        image: imageBase64,
        pn: 0,
        rn: 6
      }).toString()
    });

    const searchData = await searchResponse.json();
    console.log('[百度] 搜索结果:', JSON.stringify(searchData).substring(0, 500));

    if (searchData.error_code) {
      console.error('[百度] API 错误:', searchData.error_msg);
      return res.status(200).json({
        success: false,
        error: searchData.error_msg || '搜索失败',
        error_code: searchData.error_code,
        source: 'baidu_error'
      });
    }

    const products = parseProducts(searchData);

    return res.status(200).json({
      success: true,
      products,
      source: 'baidu_image',
      total: products.length
    });

  } catch (err) {
    console.error('[API] 异常:', err);
    return res.status(200).json({
      success: false,
      error: err.message || '服务异常',
      source: 'error'
    });
  }
}
