class DQNAgent {
    constructor(game) {
        this.game = game;
        this.stateSize = 5; // [pX, iX, iY, bX, bY]
        this.actionSize = 4; // Stay, Left, Right, Shoot
        this.memory = [];
        this.gamma = 0.95;    // discount rate
        this.epsilon = 1.0;   // exploration rate
        this.epsilonMin = 0.01;
        this.epsilonDecay = 0.995;
        this.learningRate = 0.001;
        this.model = this.createModel();
        this.targetModel = this.createModel();
        this.isTraining = false;
        this.trainingLoopId = null;
    }

    createModel() {
        const model = tf.sequential();
        model.add(tf.layers.dense({ units: 24, inputShape: [7], activation: 'relu' }));
        model.add(tf.layers.dense({ units: 24, activation: 'relu' }));
        model.add(tf.layers.dense({ units: this.actionSize, activation: 'linear' }));
        model.compile({ loss: 'meanSquaredError', optimizer: tf.train.adam(this.learningRate) });
        return model;
    }

    act(state) {
        if (Math.random() <= this.epsilon) {
            return Math.floor(Math.random() * this.actionSize);
        }
        const stateTensor = tf.tensor2d([state]);
        const preds = this.model.predict(stateTensor);
        const action = preds.argMax(1).dataSync()[0];
        stateTensor.dispose();
        preds.dispose();
        return action;
    }

    remember(state, action, reward, nextState, done) {
        if (this.memory.length > 2000) this.memory.shift();
        this.memory.push({ state, action, reward, nextState, done });
    }

    async replay(batchSize) {
        if (this.memory.length < batchSize) return;

        // Sample minibatch
        const batch = [];
        for (let i = 0; i < batchSize; i++) {
            batch.push(this.memory[Math.floor(Math.random() * this.memory.length)]);
        }

        const states = batch.map(x => x.state);
        const nextStates = batch.map(x => x.nextState);

        const stateTensor = tf.tensor2d(states);
        const nextStateTensor = tf.tensor2d(nextStates);

        const target = this.model.predict(stateTensor).dataSync();
        const targetNext = this.model.predict(nextStateTensor).dataSync();

        // Reshape for easy updates
        // Note: This is a synchronous simplification. For better performance we should check how tfjs handles batch updates

        for (let i = 0; i < batchSize; i++) {
            let targetVal = batch[i].reward;
            if (!batch[i].done) {
                // Find max Q for next state
                let maxQ = -Infinity;
                for (let j = 0; j < this.actionSize; j++) {
                    maxQ = Math.max(maxQ, targetNext[i * this.actionSize + j]);
                }
                targetVal = batch[i].reward + this.gamma * maxQ;
            }
            target[i * this.actionSize + batch[i].action] = targetVal;
        }

        const targetTensor = tf.tensor2d(target, [batchSize, this.actionSize]);

        await this.model.fit(stateTensor, targetTensor, { epochs: 1, verbose: 0 });

        stateTensor.dispose();
        nextStateTensor.dispose();
        targetTensor.dispose();

        if (this.epsilon > this.epsilonMin) {
            this.epsilon *= this.epsilonDecay;
        }

        // Update Stats UI
        document.getElementById('epsilonStat').innerText = this.epsilon.toFixed(3);
    }

    toggleTraining() {
        this.isTraining = !this.isTraining;
        this.game.aiEnabled = this.isTraining;

        if (this.isTraining) {
            document.getElementById('trainBtn').innerText = "STOP TRAINING";
            // Disable manual controls? maybe
            this.trainLoop();
        } else {
            document.getElementById('trainBtn').innerText = "START TRAINING";
            cancelAnimationFrame(this.trainingLoopId);
        }
    }

    async trainLoop() {
        if (!this.isTraining) return;

        // Reset if game over
        if (this.game.isGameOver || !this.game.isPlaying) {
            this.game.reset();
            // Maybe update episode count log
        }

        const currentState = this.game.getState();
        const action = this.act(currentState);
        const results = this.game.step(action); // { state, reward, done }

        this.remember(currentState, action, results.reward, results.state, results.done);

        // Train every few frames or every frame
        await this.replay(32);

        // Log reward
        document.getElementById('rewardStat').innerText = results.reward.toFixed(1);

        if (this.isTraining) {
            // Use setTimeout to allow UI updates and not block browser completely (tfjs uses WebGL but JS thread can block)
            // Or requestAnimationFrame for vsync speed
            this.trainingLoopId = requestAnimationFrame(() => this.trainLoop());
        }
    }

    async save(name) {
        try {
            if (!window.supabase) {
                console.error("Supabase client not initialized");
                alert("Supabase client not initialized");
                return;
            }

            console.log("Starting save process...");
            await this.model.save(tf.io.withSaveHandler(async (artifacts) => {
                console.log("Model artifacts captured", artifacts);
                const { modelTopology, weightSpecs, weightData } = artifacts;

                // Convert ArrayBuffer weightData to Base64
                let weightsBase64 = '';
                if (weightData) {
                    const bytes = new Uint8Array(weightData);
                    let binary = '';
                    const len = bytes.byteLength;
                    for (let i = 0; i < len; i++) {
                        binary += String.fromCharCode(bytes[i]);
                    }
                    weightsBase64 = btoa(binary);
                }

                const modelName = name || `dqn-model-${new Date().toISOString()}`;
                console.log(`Uploading model '${modelName}' to Supabase...`);

                const { data, error } = await window.supabase
                    .from('models')
                    .insert([
                        {
                            name: modelName,
                            model_json: modelTopology,
                            weight_specs: weightSpecs,
                            weights: weightsBase64
                        }
                    ]);

                if (error) {
                    console.error('Supabase error:', error);
                    alert('Error saving model: ' + error.message);
                    throw new Error(error.message);
                } else {
                    console.log('Model saved to Supabase:', data);
                    alert('Model saved successfully!');
                }

                return {
                    modelArtifactsInfo: {
                        dateSaved: new Date(),
                        modelTopologyType: 'JSON'
                    }
                };
            }));
        } catch (err) {
            console.error("Save failed:", err);
            alert("Save failed: " + err.message);
        }
    }

    async load(name) {
        try {
            if (!window.supabase) {
                alert("Supabase client not initialized");
                return;
            }

            // If name is provided, fetch specific model. If not, fetch latest.
            let query = window.supabase
                .from('models')
                .select('*');

            if (name) {
                query = query.eq('name', name);
            } else {
                query = query.order('created_at', { ascending: false }).limit(1);
            }

            const { data, error } = await query;

            if (error) throw error;
            if (!data || data.length === 0) {
                alert("No model found");
                return;
            }

            const record = data[0];
            console.log("Loading model:", record.name);

            const modelTopology = record.model_json;
            const weightSpecs = record.weight_specs;
            const weightsBase64 = record.weights;

            if (!weightSpecs) {
                alert("Model missing weight_specs. Cannot load legacy models saved before update.");
                return;
            }

            // Decode Base64 to ArrayBuffer
            const binaryString = atob(weightsBase64);
            const len = binaryString.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }

            const model = await tf.loadLayersModel(tf.io.fromMemory(
                modelTopology,
                weightSpecs,
                bytes.buffer
            ));

            // Recompile is needed after loading
            model.compile({ loss: 'meanSquaredError', optimizer: tf.train.adam(this.learningRate) });

            this.model.dispose(); // Cleanup old model
            this.model = model;

            console.log("Model loaded successfully");
            if (document.getElementById('modelName')) {
                document.getElementById('modelName').innerText = record.name;
            }
            alert(`Model '${record.name}' loaded!`);

        } catch (err) {
            console.error("Load failed:", err);
            alert("Load failed: " + err.message);
        }
    }
}

// Attach to window so we can init it
window.DQNAgent = DQNAgent;
