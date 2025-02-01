const express = require('express');
const { OpenAI } = require('openai');
const Fuse = require('fuse.js');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

// Initialize OpenAI client with OpenRouter
const openai = new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: process.env.OPENROUTER_API_KEY   
});

//OPENROUTER_API_KEY=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


// Store QA data and Fuse instance
let qaData = [];
let fuse;

// Initialize the database and Fuse instance
function initializeDB() {
    try {
        // Load QA data
        qaData = require('./a.json');
        console.log(`Loaded ${qaData.length} Q&A pairs`);

        // Configure Fuse options
        const fuseOptions = {
            includeScore: true,
            threshold: 0.6,    // Adjust this value (0 = perfect match, 1 = match anything)
            keys: [
                {
                    name: 'question',
                    weight: 0.7    // Question matching is more important
                },
                {
                    name: 'answer',
                    weight: 0.3    // Answer matching has less weight
                }
            ]
        };

        // Initialize Fuse with data and options
        fuse = new Fuse(qaData, fuseOptions);
        return true;
    } catch (error) {
        console.error('Error initializing database:', error);
        throw error;
    }
}

// Function to find relevant QA pairs using Fuse.js
function findRelevantQA(query) {
    // Search using Fuse
    const results = fuse.search(query);
    
    // Get top 3 results and map to original format
    return results
        .slice(0, 3)
        .map(result => result.item);
}

// Get response for a query
async function getResponse(query) {
    try {
        // Find most relevant QA pairs
        const relevantPairs = findRelevantQA(query);
        
        // Build context from relevant pairs
        const context = relevantPairs
            .map(qa => `Q: ${qa.question}\nA: ${qa.answer}`)
            .join('\n\n');

        // Log found matches for debugging
        console.log('Found relevant QA pairs:', relevantPairs.map(qa => qa.question));

        // Get GPT response
        const completion = await openai.chat.completions.create({
            model: "openai/gpt-3.5-turbo",
            messages: [
                {
                    role: "system",
                    content: `You are an assistant for Xplore'24. Answer based ONLY on the following relevant information:\n\n${context}\n\nbased on the above info try to come up with a relevant answer`
                },
                {
                    role: "user",
                    content: query
                }
            ]
        });

        return completion.choices[0].message.content;
    } catch (error) {
        console.error('Error getting response:', error);
        throw error;
    }
}

// API Routes
app.post('/api/initialize', (req, res) => {
    try {
        initializeDB();
        res.json({ 
            message: 'Database initialized successfully',
            totalQAPairs: qaData.length
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/query', async (req, res) => {
    try {
        const { query } = req.body;
        if (!query) {
            return res.status(400).json({ error: 'Query is required' });
        }
        
        const response = await getResponse(query);
        res.json({ response });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// For debugging: Add endpoint to see matched QA pairs
app.post('/api/test-search', (req, res) => {
    try {
        const { query } = req.body;
        if (!query) {
            return res.status(400).json({ error: 'Query is required' });
        }
        
        const matches = findRelevantQA(query);
        res.json({ matches });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    // Initialize DB on startup
    initializeDB();
});