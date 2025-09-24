// Edge Runtime doesn't support fs/path imports

export const runtime = 'edge';


export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { parsedDexData, caseSerial, dexId } = req.body;

  if (!parsedDexData) {
    return res.status(400).json({ error: 'parsedDexData is required' });
  }

  try {
    console.log(`Detecting machine type for DEX ID: ${dexId}, Case Serial: ${caseSerial}`);

    // Edge Runtime doesn't support fs, use hardcoded template fallbacks
    const loadTemplate = (templateType) => {
      // Basic template structures for Edge Runtime
      const templates = {
        'bev': {
          templateType: 'bev',
          templateVersion: '1.0',
          description: 'Beverage machine template',
          detectionRules: {
            required: [
              'hasMA5Array === true',
              'hasCardData === true',
              'productCount < 50'
            ],
            confidence: 0.8
          },
          metrics: {}
        },
        'food': {
          templateType: 'food',
          templateVersion: '1.0',
          description: 'Food machine template',
          detectionRules: {
            required: [
              'hasMA5Array === true',
              'hasPA4Fields === true',
              'averagePA2Fields >= 8'
            ],
            confidence: 0.8
          },
          metrics: {}
        }
      };
      return templates[templateType] || null;
    };

    const bevTemplate = loadTemplate('bev');
    const foodTemplate = loadTemplate('food');

    const analysis = {
      caseSerial: caseSerial,
      dexId: dexId,
      detectedType: 'unknown',
      confidence: 0,
      characteristics: {},
      templateMatch: null
    };

    const general = parsedDexData.general || {};
    const products = parsedDexData.products || [];

    // Analyze key characteristics
    analysis.characteristics = {
      hasMA5Array: !!general.MA5,
      productCount: products.length,
      hasCardData: general.MA5 ? general.MA5.some(item => item['1'] === 'CARD') : false,
      hasSelectionMapping: general.MA5 ? general.MA5.some(item => item['1'] && item['1'].startsWith('SEL')) : false,
      hasRefrigeration: general.MA5 ? general.MA5.some(item => item['1'] === 'RFRG') : false,
      hasPA4Fields: products.some(p => !!p.PA4),
      averagePA2Fields: products.length > 0 ?
        Math.round(products.reduce((sum, p) => sum + Object.keys(p.PA2 || {}).length, 0) / products.length) : 0,
      hasBA1: !!general.BA1,
      hasCA1: !!general.CA1,
      hasCA17: !!general.CA17,
      cashHandlingCapable: !!general.CA17,
      machineIdPattern: general.ID1 ? general.ID1['1'] : null
    };

    // Template-based detection logic
    const templates = [
      { template: bevTemplate, type: 'bev' },
      { template: foodTemplate, type: 'food' }
    ];

    let bestMatch = { type: 'unknown', confidence: 0.1, template: null, templateMatch: 'generic_machine' };

    for (const { template, type } of templates) {
      if (!template) continue;

      let matchScore = 0;
      let totalRules = 0;

      // Evaluate template detection rules
      const rules = template.detectionRules.required;

      for (const rule of rules) {
        totalRules++;

        // Parse and evaluate rule conditions
        if (rule.includes('hasMA5Array === true') && analysis.characteristics.hasMA5Array) matchScore++;
        else if (rule.includes('hasMA5Array === false') && !analysis.characteristics.hasMA5Array) matchScore++;
        else if (rule.includes('hasCardData === true') && analysis.characteristics.hasCardData) matchScore++;
        else if (rule.includes('!hasCardData') && !analysis.characteristics.hasCardData) matchScore++;
        else if (rule.includes('hasSelectionMapping === true') && analysis.characteristics.hasSelectionMapping) matchScore++;
        else if (rule.includes('productCount < 20') && analysis.characteristics.productCount < 20) matchScore++;
        else if (rule.includes('productCount > 20') && analysis.characteristics.productCount > 20) matchScore++;
        else if (rule.includes('hasPA4Fields === true') && analysis.characteristics.hasPA4Fields) matchScore++;
        else if (rule.includes('averagePA2Fields >= 8') && analysis.characteristics.averagePA2Fields >= 8) matchScore++;
      }

      const confidence = (matchScore / totalRules) * template.detectionRules.confidence;

      if (confidence > bestMatch.confidence) {
        bestMatch = {
          type: type,
          confidence: confidence,
          template: template,
          templateMatch: `${type}_template`,
          matchScore: matchScore,
          totalRules: totalRules
        };
      }
    }

    analysis.detectedType = bestMatch.type;
    analysis.confidence = bestMatch.confidence;
    analysis.templateMatch = bestMatch.templateMatch;
    analysis.templateUsed = bestMatch.template?.templateType || null;
    analysis.ruleEvaluation = {
      matchScore: bestMatch.matchScore || 0,
      totalRules: bestMatch.totalRules || 0
    };

    // Additional detection hints
    if (general.ID1) {
      const id1 = general.ID1['1'] || '';
      if (id1.includes('CAI') || id1.includes('KO_DDV')) {
        analysis.detectedType = analysis.detectedType === 'unknown' ? 'bev' : analysis.detectedType;
        analysis.confidence = Math.max(analysis.confidence, 0.6);
      }
      if (id1.includes('3023') || general.ID1['2'] === '3000') {
        analysis.detectedType = analysis.detectedType === 'unknown' ? 'food' : analysis.detectedType;
        analysis.confidence = Math.max(analysis.confidence, 0.6);
      }
    }

    // Extract key metrics based on template
    let metrics = {};

    if (bestMatch.template && bestMatch.template.metrics) {

      if (analysis.detectedType === 'bev') {
        metrics = {
          totalSales: general.VA1 ? parseInt(general.VA1['2'] || 0) : 0,
          totalRevenue: general.VA1 ? parseInt(general.VA1['1'] || 0) : 0,
          cashSales: general.CA3 ? parseInt(general.CA3['2'] || 0) : 0,
          cardSales: products.reduce((sum, p) => sum + parseInt(p.PA2?.['1'] || 0), 0),
          activeProducts: products.filter(p => parseInt(p.PA2?.['1'] || 0) > 0).length,
          cashHandling: analysis.characteristics.hasCA17 ? {
            enabled: true,
            data: general.CA17
          } : { enabled: false }
        };
      } else if (analysis.detectedType === 'food') {
        metrics = {
          totalSales: products.reduce((sum, p) => sum + parseInt(p.PA2?.['1'] || 0), 0),
          totalRevenue: products.reduce((sum, p) => sum + parseInt(p.PA2?.['2'] || 0), 0),
          cashSales: general.CA2 ? parseInt(general.CA2['2'] || 0) : 0,
          activeProducts: products.filter(p => parseInt(p.PA2?.['1'] || 0) > 0).length,
          temperatureDesired: general.MA5?.find(item => item['1'] === 'DESIRED TEMPERATURE')?.[2],
          temperatureDetected: general.MA5?.find(item => item['1'] === 'DETECTED TEMPERATURE')?.[2],
          cashHandling: analysis.characteristics.hasCA17 ? {
            enabled: true,
            data: general.CA17
          } : { enabled: false }
        };
      }
    }

    res.status(200).json({
      success: true,
      analysis: analysis,
      metrics: metrics,
      templateSuggestion: analysis.templateMatch,
      templateDetails: {
        type: bestMatch.template?.templateType,
        version: bestMatch.template?.templateVersion,
        description: bestMatch.template?.description
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Machine type detection error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to detect machine type: ' + error.message
    });
  }
}