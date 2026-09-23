const express = require('express');
const router = express.Router();
const axios = require('axios');
require('dotenv').config();

const SERPAPI_KEY = process.env.SERPAPI_KEY;

// Search places using SERPAPI
router.get('/search', async (req, res) => {
  try {
    const { query, location = 'South Africa' } = req.query;
    
    if (!query) {
      return res.status(400).json({ error: 'Query parameter is required' });
    }

    if (!SERPAPI_KEY) {
      return res.status(500).json({ error: 'SERPAPI_KEY not configured' });
    }

    const response = await axios.get('https://serpapi.com/search.json', {
      params: {
        engine: 'google_maps',
        q: `${query} ${location}`,
        api_key: SERPAPI_KEY,
        type: 'search'
      }
    });

    if (response.data && response.data.local_results) {
      const results = response.data.local_results.map(result => ({
        place_id: result.place_id || result.place_id_search,
        title: result.title,
        rating: result.rating || null,
        reviews: result.reviews || null,
        type: result.type || null,
        address: result.address || null,
        phone: result.phone || null,
        website: result.website || null,
        description: result.description || null,
        thumbnail: result.thumbnail || null,
        latitude: result.gps_coordinates?.latitude || null,
        longitude: result.gps_coordinates?.longitude || null
      }));
      res.json(results);
    } else {
      res.json([]);
    }
  } catch (error) {
    console.error('Error searching places:', error.message);
    res.status(500).json({ error: 'Failed to search places' });
  }
});

// Get place details
router.get('/details/:placeId', async (req, res) => {
  try {
    const { placeId } = req.params;

    if (!SERPAPI_KEY) {
      return res.status(500).json({ error: 'SERPAPI_KEY not configured' });
    }

    const response = await axios.get('https://serpapi.com/search.json', {
      params: {
        engine: 'google_maps',
        place_id: placeId,
        api_key: SERPAPI_KEY
      }
    });

    if (response.data) {
      const result = response.data;
      const details = {
        place_id: placeId,
        title: result.title,
        rating: result.rating || null,
        reviews: result.reviews || null,
        type: result.type || null,
        address: result.address || null,
        phone: result.phone || null,
        website: result.website || null,
        description: result.description || null,
        thumbnail: result.thumbnail || null,
        images: result.images?.map(img => img.original) || [],
        latitude: result.gps_coordinates?.latitude || null,
        longitude: result.gps_coordinates?.longitude || null,
        price_level: result.price_level || null
      };
      res.json(details);
    } else {
      res.status(404).json({ error: 'Place not found' });
    }
  } catch (error) {
    console.error('Error getting place details:', error.message);
    res.status(500).json({ error: 'Failed to get place details' });
  }
});

// Search for images
router.get('/images', async (req, res) => {
  try {
    const { query, count = 10 } = req.query;

    if (!query) {
      return res.status(400).json({ error: 'Query parameter is required' });
    }

    if (!SERPAPI_KEY) {
      return res.status(500).json({ error: 'SERPAPI_KEY not configured' });
    }

    const response = await axios.get('https://serpapi.com/search.json', {
      params: {
        engine: 'google_images',
        q: query,
        api_key: SERPAPI_KEY,
        ijn: '0'
      }
    });

    if (response.data && response.data.images_results) {
      const images = response.data.images_results.slice(0, parseInt(count)).map(img => ({
        original: img.original || img.original_link,
        thumbnail: img.thumbnail || img.thumbnail_link,
        title: img.title || null,
        source: img.source || null
      }));
      res.json(images);
    } else {
      res.json([]);
    }
  } catch (error) {
    console.error('Error searching images:', error.message);
    res.status(500).json({ error: 'Failed to search images' });
  }
});

// Get recommendations by category
router.get('/recommendations', async (req, res) => {
  try {
    const { category, location = 'South Africa' } = req.query;

    if (!category) {
      return res.status(400).json({ error: 'Category parameter is required' });
    }

    const queries = {
      sightseeing: `top tourist attractions in ${location}`,
      food: `best restaurants in ${location}`,
      nightlife: `best nightlife in ${location}`,
      adventure: `adventure activities in ${location}`,
      nature: `nature reserves in ${location}`,
      culture: `cultural attractions in ${location}`
    };

    const searchQuery = queries[category] || `${category} in ${location}`;
    
    const response = await axios.get('https://serpapi.com/search.json', {
      params: {
        engine: 'google_maps',
        q: searchQuery,
        api_key: SERPAPI_KEY,
        type: 'search'
      }
    });

    if (response.data && response.data.local_results) {
      const results = response.data.local_results.map(result => ({
        place_id: result.place_id || result.place_id_search,
        title: result.title,
        rating: result.rating || null,
        reviews: result.reviews || null,
        address: result.address || null,
        thumbnail: result.thumbnail || null,
        description: result.description || null
      }));
      res.json(results);
    } else {
      res.json([]);
    }
  } catch (error) {
    console.error('Error getting recommendations:', error.message);
    res.status(500).json({ error: 'Failed to get recommendations' });
  }
});

module.exports = router;