"""
Scrape real ML content and store in Qdrant.
Run from backend/: python scripts/scrape_ml.py
"""
import asyncio
import os
import sys

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from agents.scraper_agent import scrape_subject
from agents.chunker_agent import chunk_and_store

MODULES = [
    (1, "Introduction to Neural Networks"),
    (2, "Supervised Learning"),
    (3, "Convolutional Neural Networks"),
    (4, "Unsupervised Learning"),
    (5, "Neural Networks and Deep Learning"),
]


_JUNK_PHRASES = [
    "page not found",
    "showing posts matching",
    "no results found",
    "search results",
    "oops! that page",
    "404",
]


def _is_useful(content: str) -> bool:
    """Return True only if content looks like actual subject material."""
    if not content or len(content) < 500:
        return False
    lower = content.lower()
    junk_count = sum(1 for p in _JUNK_PHRASES if p in lower)
    if junk_count >= 2:
        return False
    # Must contain at least some domain words
    domain_words = ["algorithm", "learning", "model", "training", "data",
                    "classification", "regression", "neural", "cluster"]
    matches = sum(1 for w in domain_words if w in lower)
    return matches >= 3


async def main():
    print("Storing Machine Learning content in Qdrant")
    print("=" * 60)

    total = 0
    for module_number, module_title in MODULES:
        print(f"\nModule {module_number}: {module_title}")
        scraped_ok = False
        try:
            content = await scrape_subject(
                subject_name="Machine Learning",
                module_number=module_number,
                branch="AIML",
                semester=5,
            )
            if _is_useful(content):
                chunks = await chunk_and_store(content, "Machine Learning", module_number)
                total += chunks
                scraped_ok = True
                print(f"  Scraped: stored {chunks} chunks")
        except Exception as e:
            print(f"  Scrape failed: {e}")

        if not scraped_ok:
            print(f"  Scraped content not useful — using structured fallback")
            fallback = _fallback_content(module_number, module_title)
            chunks = await chunk_and_store(fallback, "Machine Learning", module_number)
            total += chunks
            print(f"  Fallback: stored {chunks} chunks")

    print("\n" + "=" * 60)
    print(f"Total chunks stored: {total}")


def _fallback_content(module_number: int, module_title: str) -> str:
    """Minimal structured fallback so Qdrant has something to return."""
    fallbacks = {
        1: """# Introduction to Machine Learning

## What is Machine Learning?
Machine Learning (ML) is a subset of Artificial Intelligence that gives computers
the ability to learn from data without being explicitly programmed.

## Types of Learning
- **Supervised Learning**: Model trained on labeled data. Examples: classification, regression.
- **Unsupervised Learning**: Model finds patterns in unlabeled data. Examples: clustering, dimensionality reduction.
- **Reinforcement Learning**: Agent learns by interacting with environment and receiving rewards/penalties.

## Key Concepts
- **Training Set**: Data used to train the model.
- **Test Set**: Data used to evaluate model performance.
- **Overfitting**: Model memorizes training data but fails on new data (high variance).
- **Underfitting**: Model is too simple to capture patterns (high bias).
- **Bias-Variance Tradeoff**: Balance between model complexity and generalization.

## Applications
- Spam detection, image recognition, recommendation systems, medical diagnosis,
  autonomous vehicles, natural language processing.

## VTU Exam Tips
- Define ML and distinguish from AI and Deep Learning.
- List and explain types of ML with examples.
- Explain overfitting/underfitting with bias-variance tradeoff.
""",
        2: """# Supervised Learning

## Classification
Predicts a discrete class label. Algorithm assigns input to one of predefined categories.

### K-Nearest Neighbors (KNN)
- Classifies based on the K closest training examples.
- Distance metric: Euclidean, Manhattan.
- Choosing K: odd number to avoid ties; small K = overfit, large K = underfit.

### Decision Trees (ID3, C4.5)
- Tree structure: root node, internal nodes (features), leaf nodes (class labels).
- **ID3**: uses Information Gain = Entropy(parent) - weighted Entropy(children).
- **C4.5**: uses Gain Ratio to handle multi-valued attributes.
- **Pruning**: Reduces overfitting by removing branches.

### Random Forest
- Ensemble of decision trees trained on random subsets (bagging).
- Final prediction by majority vote (classification) or average (regression).
- Reduces variance; more robust than single tree.

## Regression
Predicts a continuous output value.

### Linear Regression
- Models linear relationship: y = b0 + b1*x
- Least Squares: minimizes sum of squared residuals.
- Multiple Linear Regression: y = b0 + b1*x1 + b2*x2 + ...

### VTU Exam Tips
- Derive Information Gain formula for ID3.
- Explain Random Forest with bagging concept.
- Differentiate classification vs regression.
""",
        3: """# Convolutional Neural Networks (CNN)

## Architecture
CNNs are deep learning models designed for processing grid-like data (images).

### Layers
1. **Convolutional Layer**: Applies filters/kernels to extract features.
   - Filter slides over input, computes dot product.
   - Output = Feature Map.
2. **Activation (ReLU)**: Introduces non-linearity. ReLU(x) = max(0, x).
3. **Pooling Layer**: Reduces spatial dimensions.
   - Max Pooling: takes maximum value in window.
   - Average Pooling: takes average value.
4. **Fully Connected Layer**: Final classification based on learned features.

## Key Concepts
- **Padding**: Adds zeros around input to preserve spatial dimensions.
- **Stride**: Step size of filter movement.
- **Receptive Field**: Region in input space a feature responds to.
- **Weight Sharing**: Same filter applied across entire image (reduces parameters).

## Training
- **Backpropagation**: Gradients flow through layers using chain rule.
- **SGD / Adam optimizer**: Updates weights to minimize loss.

## VTU Exam Tips
- Draw CNN architecture diagram.
- Explain convolution operation with example.
- Compare CNN vs traditional neural networks.
""",
        4: """# Unsupervised Learning

## Clustering
Groups similar data points without labels.

### K-Means Clustering
1. Initialize K cluster centroids randomly.
2. Assign each point to nearest centroid.
3. Recalculate centroids as mean of assigned points.
4. Repeat until convergence.
- **Choosing K**: Elbow method — plot inertia vs K.
- Limitation: sensitive to initialization, assumes spherical clusters.

### Hierarchical Clustering
- **Agglomerative (bottom-up)**: Start with each point as cluster, merge closest.
- **Divisive (top-down)**: Start with one cluster, split.
- **Linkage**: Single, Complete, Average, Ward.
- Output: Dendrogram (tree diagram).

### DBSCAN
- Density-Based Spatial Clustering.
- Core point: has >= minPts neighbors within radius epsilon.
- Border point: within epsilon of core but fewer neighbors.
- Noise/outlier: not core or border.
- Advantage: finds arbitrary-shaped clusters, handles outliers.

## Dimensionality Reduction
### PCA (Principal Component Analysis)
- Finds principal components (directions of max variance).
- Steps: center data → compute covariance matrix → eigendecomposition → project.

## VTU Exam Tips
- Explain K-means algorithm step by step with example.
- Differentiate K-means vs DBSCAN.
- Explain dendrogram with diagram.
""",
        5: """# Neural Networks and Deep Learning

## Perceptron
- Simplest neural network unit.
- Output = activation(weighted sum of inputs + bias).
- Single-layer perceptron: only linearly separable problems.
- Limitation: cannot solve XOR problem.

## Multilayer Perceptron (MLP)
- Input layer → Hidden layers → Output layer.
- Hidden layers allow learning non-linear boundaries.

## Backpropagation Algorithm
1. Forward pass: compute predictions.
2. Compute loss (e.g., MSE, Cross-Entropy).
3. Backward pass: compute gradients using chain rule.
4. Update weights: w = w - learning_rate * gradient.

## Activation Functions
| Function | Formula | Use |
|----------|---------|-----|
| Sigmoid  | 1/(1+e^-x) | Binary output, vanishing gradient issue |
| ReLU     | max(0,x) | Hidden layers, sparse activation |
| Tanh     | (e^x-e^-x)/(e^x+e^-x) | Zero-centered, hidden layers |
| Softmax  | e^xi/sum(e^xj) | Multi-class output |

## Optimization
- **Gradient Descent**: SGD, Mini-batch GD, Adam.
- **Dropout**: Randomly zeros neurons during training to prevent overfitting.
- **Batch Normalization**: Normalizes layer inputs for faster training.

## Deep Learning
- Neural networks with many hidden layers.
- Automatically learns hierarchical feature representations.
- Applications: image classification, NLP, speech recognition.

## VTU Exam Tips
- Explain backpropagation with diagrams.
- Compare sigmoid vs ReLU activation functions.
- Explain vanishing gradient problem and solutions.
""",
    }
    return fallbacks.get(module_number, f"# {module_title}\n\nModule {module_number} content for Machine Learning.")


if __name__ == "__main__":
    asyncio.run(main())
