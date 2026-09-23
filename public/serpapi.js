// SERPAPI Client - Frontend
const SerpAPI = {
  baseUrl: '/api/serpapi',

  // Search for places
  async searchPlaces(query, location = 'South Africa') {
    try {
      const response = await fetch(
        `${this.baseUrl}/search?query=${encodeURIComponent(query)}&location=${encodeURIComponent(location)}`
      );
      if (!response.ok) throw new Error('Failed to search places');
      return await response.json();
    } catch (error) {
      console.error('Error searching places:', error);
      return [];
    }
  },

  // Get place details
  async getPlaceDetails(placeId) {
    try {
      const response = await fetch(`${this.baseUrl}/details/${placeId}`);
      if (!response.ok) throw new Error('Failed to get place details');
      return await response.json();
    } catch (error) {
      console.error('Error getting place details:', error);
      return null;
    }
  },

  // Search for images
  async searchImages(query, count = 10) {
    try {
      const response = await fetch(
        `${this.baseUrl}/images?query=${encodeURIComponent(query)}&count=${count}`
      );
      if (!response.ok) throw new Error('Failed to search images');
      return await response.json();
    } catch (error) {
      console.error('Error searching images:', error);
      return [];
    }
  },

  // Get recommendations
  async getRecommendations(category, location = 'South Africa') {
    try {
      const response = await fetch(
        `${this.baseUrl}/recommendations?category=${encodeURIComponent(category)}&location=${encodeURIComponent(location)}`
      );
      if (!response.ok) throw new Error('Failed to get recommendations');
      return await response.json();
    } catch (error) {
      console.error('Error getting recommendations:', error);
      return [];
    }
  },

  // Import a place as a destination
  async importPlace(placeId, category, location) {
    try {
      // Get place details
      const place = await this.getPlaceDetails(placeId);
      if (!place) throw new Error('Place not found');

      // Get images
      const images = await this.searchImages(place.title, 5);
      const imageUrl = images.length > 0 ? images[0].original : null;

      // Prepare data for import
      const data = {
        name: place.title,
        description: place.description || `${place.title} - A must-visit destination in South Africa`,
        category: category || 'sightseeing',
        location: location || place.address || 'South Africa',
        rating: place.rating ? Math.round(place.rating) : 4,
        image_url: imageUrl,
        meta: JSON.stringify({
          place_id: place.place_id,
          reviews: place.reviews,
          type: place.type,
          price_level: place.price_level,
          address: place.address,
          phone: place.phone,
          website: place.website,
          latitude: place.latitude,
          longitude: place.longitude,
          images: place.images || []
        })
      };

      // Send to server
      const response = await fetch('/api/destinations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to import place');
      }

      return await response.json();
    } catch (error) {
      console.error('Error importing place:', error);
      throw error;
    }
  }
};