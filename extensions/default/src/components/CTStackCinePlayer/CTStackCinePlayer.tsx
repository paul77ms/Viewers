import React, { useState, useEffect, useRef } from 'react';
import { Types } from '@ohif/core';
import { imageLoader } from '@cornerstonejs/core';
import './CTStackCinePlayer.css';

interface CTStackCinePlayerProps {
  displaySet: Types.DisplaySet;
  onClose: () => void;
  servicesManager: any;
}

const CTStackCinePlayer: React.FC<CTStackCinePlayerProps> = ({
  displaySet,
  onClose,
  servicesManager,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [frameRate, setFrameRate] = useState(10); // fps
  const [loadedImages, setLoadedImages] = useState<Map<number, any>>(new Map());
  const [loadingImages, setLoadingImages] = useState<Set<number>>(new Set());
  const [containerSize, setContainerSize] = useState({ 
    width: Math.min(1600, window.innerWidth * 0.85), // 기본 너비를 훨씬 크게
    height: Math.min(1000, window.innerHeight * 0.85) // 기본 높이를 훨씬 크게
  });
  const [isResizing, setIsResizing] = useState(false);
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const imageIds = displaySet.imageIds || [];
  const totalImages = imageIds.length;

  // 최대 크기 상수 정의
  const MAX_WIDTH = 1630.5;
  const MAX_HEIGHT = 930.5;

  // 전체 화면 토글
  const toggleFullscreen = () => {
    if (isFullscreen) {
      setContainerSize({ 
        width: Math.min(1600, window.innerWidth * 0.85),
        height: Math.min(1000, window.innerHeight * 0.85)
      });
    } else {
      setContainerSize({ 
        width: Math.min(MAX_WIDTH, window.innerWidth * 0.98), // 최대 크기로 제한
        height: Math.min(MAX_HEIGHT, window.innerHeight * 0.98)
      });
    }
    setIsFullscreen(!isFullscreen);
  };

  // 리사이즈 핸들 마우스 다운 이벤트
  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    setResizeStart({
      x: e.clientX,
      y: e.clientY,
      width: containerSize.width,
      height: containerSize.height
    });
  };

  // 공통 리사이즈 로직
  const calculateNewSize = (deltaX: number, deltaY: number, resizeType: 'both' | 'width' | 'height') => {
    // 최대 크기를 고정값으로 제한
    const maxWidth = MAX_WIDTH;
    const maxHeight = MAX_HEIGHT;
    
    let newWidth = resizeStart.width;
    let newHeight = resizeStart.height;
    
    if (resizeType === 'both' || resizeType === 'width') {
      newWidth = Math.max(400, Math.min(maxWidth, resizeStart.width + deltaX));
    }
    
    if (resizeType === 'both' || resizeType === 'height') {
      newHeight = Math.max(300, Math.min(maxHeight, resizeStart.height + deltaY));
    }
    
    return { width: newWidth, height: newHeight };
  };

  // 리사이즈 중 마우스 이동 이벤트
  useEffect(() => {
    const handleResizeMove = (e: MouseEvent) => {
      if (!isResizing) return;
      
      const deltaX = e.clientX - resizeStart.x;
      const deltaY = e.clientY - resizeStart.y;
      
      const newSize = calculateNewSize(deltaX, deltaY, 'both');
      setContainerSize(newSize);
    };

    const handleResizeEnd = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleResizeMove);
      document.addEventListener('mouseup', handleResizeEnd);
    }

    return () => {
      document.removeEventListener('mousemove', handleResizeMove);
      document.removeEventListener('mouseup', handleResizeEnd);
    };
  }, [isResizing, resizeStart]);

  // Cornerstone 이미지 로딩 함수
  const loadImage = async (imageId: string, index: number): Promise<void> => {
    if (loadedImages.has(index) || loadingImages.has(index)) {
      return;
    }

    setLoadingImages(prev => new Set([...prev, index]));

    try {
      // OHIF와 동일한 방식으로 Cornerstone 이미지 로딩
      const image = await imageLoader.loadAndCacheImage(imageId);
      
      if (image) {
        setLoadedImages(prev => new Map([...prev, [index, image]]));
      }
    } catch (error) {
      console.warn('Failed to load image:', imageId, error);
    } finally {
      setLoadingImages(prev => {
        const newSet = new Set(prev);
        newSet.delete(index);
        return newSet;
      });
    }
  };

  // 현재 이미지와 주변 이미지들을 미리 로드
  useEffect(() => {
    const preloadImages = async () => {
      if (imageIds.length === 0) return;
      
      // 현재 이미지와 앞뒤 몇 장을 미리 로드
      const preloadRange = 5;
      const indicesToLoad = [];
      
      for (let i = Math.max(0, currentImageIndex - preloadRange); 
           i <= Math.min(totalImages - 1, currentImageIndex + preloadRange); 
           i++) {
        indicesToLoad.push(i);
      }
      
      // 병렬로 이미지 로드
      await Promise.all(indicesToLoad.map(index => loadImage(imageIds[index], index)));
    };

    preloadImages();
  }, [currentImageIndex, imageIds]);

  // Canvas에 이미지 렌더링
  const renderImageToCanvas = (image: any) => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;

    const context = canvas.getContext('2d');
    if (!context) return;

    try {
      const { width, height } = image;
      canvas.width = width;
      canvas.height = height;

      // Clear canvas
      context.clearRect(0, 0, width, height);

      // Get pixel data
      const pixelData = image.getPixelData();
      
      if (pixelData) {
        // Create ImageData for rendering
        const imageData = context.createImageData(width, height);
        const data = imageData.data;

        // Convert pixel data to RGBA
        for (let i = 0; i < pixelData.length; i++) {
          // Simple window/level conversion - in real DICOM viewers this would be more sophisticated
          let pixelValue = pixelData[i];
          
          // Basic windowing (adjust these values based on the image type)
          const windowWidth = image.windowWidth || 256;
          const windowCenter = image.windowCenter || 128;
          
          const minValue = windowCenter - windowWidth / 2;
          const maxValue = windowCenter + windowWidth / 2;
          
          // Normalize to 0-255 range
          pixelValue = Math.max(0, Math.min(255, 
            ((pixelValue - minValue) / (maxValue - minValue)) * 255
          ));

          const index4 = i * 4;
          data[index4] = pixelValue;     // R
          data[index4 + 1] = pixelValue; // G
          data[index4 + 2] = pixelValue; // B
          data[index4 + 3] = 255;       // A
        }

        context.putImageData(imageData, 0, 0);
      }
    } catch (error) {
      console.error('Error rendering image to canvas:', error);
      // Fallback: draw placeholder
      context.fillStyle = '#333';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = '#fff';
      context.font = '20px Arial';
      context.textAlign = 'center';
      context.fillText('이미지 로딩 오류', canvas.width / 2, canvas.height / 2);
    }
  };

  // 현재 이미지가 변경될 때 Canvas 업데이트
  useEffect(() => {
    const currentImage = loadedImages.get(currentImageIndex);
    if (currentImage) {
      renderImageToCanvas(currentImage);
    }
  }, [currentImageIndex, loadedImages]);

  // 재생/일시정지 토글
  const togglePlayPause = () => {
    setIsPlaying(!isPlaying);
  };

  // 외부 클릭 감지하여 플레이어 종료
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  // 재생 로직
  useEffect(() => {
    if (isPlaying && totalImages > 1) {
      intervalRef.current = setInterval(() => {
        setCurrentImageIndex((prevIndex) => {
          return (prevIndex + 1) % totalImages;
        });
      }, 1000 / frameRate);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isPlaying, frameRate, totalImages]);

  // 컴포넌트 언마운트 시 정리
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  if (totalImages === 0) {
    return (
      <div className="ct-stack-cine-player-overlay">
        <div 
          ref={containerRef}
          className="ct-stack-cine-player-container"
        >
          <div className="ct-stack-cine-player-error">
            No images available for playback.
          </div>
        </div>
      </div>
    );
  }

  const currentImageId = imageIds[currentImageIndex];
  const imageNumber = currentImageIndex + 1;
  const currentImage = loadedImages.get(currentImageIndex);
  const isCurrentImageLoaded = loadedImages.has(currentImageIndex);
  const isCurrentImageLoading = loadingImages.has(currentImageIndex);

  return (
    <div className={`ct-stack-cine-player-overlay ${isResizing ? 'resizing' : ''}`}>
      <div 
        ref={containerRef}
        className="ct-stack-cine-player-container"
        style={{
          width: `${containerSize.width}px`,
          height: `${containerSize.height}px`,
          maxWidth: 'none', // CSS 최대 너비 제한 해제
          maxHeight: 'none', // CSS 최대 높이 제한 해제
          cursor: isResizing ? 'nw-resize' : 'pointer',
          position: 'relative'
        }}
        onClick={!isResizing ? togglePlayPause : undefined}
      >

        {/* 리사이즈 핸들들 */}
        <div
          className="resize-handle resize-handle-bottom-right"
          onMouseDown={handleResizeStart}
          style={{
            position: 'absolute',
            bottom: 0,
            right: 0,
            width: '20px',
            height: '20px',
            cursor: 'nw-resize',
            background: 'linear-gradient(135deg, transparent 50%, rgba(59, 130, 246, 0.5) 50%)',
            borderBottomRightRadius: '16px',
            zIndex: 10
          }}
        />
        <div
          className="resize-handle resize-handle-right"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsResizing(true);
            const resizeStartData = {
              x: e.clientX,
              y: e.clientY,
              width: containerSize.width,
              height: containerSize.height
            };
            setResizeStart(resizeStartData);
            
            const handleMouseMove = (moveEvent: MouseEvent) => {
              const deltaX = moveEvent.clientX - resizeStartData.x;
              const newSize = calculateNewSize(deltaX, 0, 'width');
              setContainerSize(newSize);
            };
            
            const handleMouseUp = () => {
              setIsResizing(false);
              document.removeEventListener('mousemove', handleMouseMove);
              document.removeEventListener('mouseup', handleMouseUp);
            };
            
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
          }}
          style={{
            position: 'absolute',
            top: '50%',
            right: 0,
            width: '8px',
            height: '60px',
            cursor: 'ew-resize',
            background: 'rgba(59, 130, 246, 0.3)',
            borderRadius: '4px 0 0 4px',
            transform: 'translateY(-50%)',
            zIndex: 10
          }}
        />
        <div
          className="resize-handle resize-handle-bottom"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsResizing(true);
            const resizeStartData = {
              x: e.clientX,
              y: e.clientY,
              width: containerSize.width,
              height: containerSize.height
            };
            setResizeStart(resizeStartData);
            
            const handleMouseMove = (moveEvent: MouseEvent) => {
              const deltaY = moveEvent.clientY - resizeStartData.y;
              const newSize = calculateNewSize(0, deltaY, 'height');
              setContainerSize(newSize);
            };
            
            const handleMouseUp = () => {
              setIsResizing(false);
              document.removeEventListener('mousemove', handleMouseMove);
              document.removeEventListener('mouseup', handleMouseUp);
            };
            
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
          }}
          style={{
            position: 'absolute',
            bottom: 0,
            left: '50%',
            width: '60px',
            height: '8px',
            cursor: 'ns-resize',
            background: 'rgba(59, 130, 246, 0.3)',
            borderRadius: '4px 4px 0 0',
            transform: 'translateX(-50%)',
            zIndex: 10
          }}
        />

        <div className="ct-stack-cine-player-header">
          <h3 className="ct-stack-cine-player-title">
            {displaySet.SeriesDescription || displaySet.Modality || 'Unknown Series'}
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>

            <button 
              className="ct-stack-cine-player-fullscreen"
              onClick={(e) => {
                e.stopPropagation();
                toggleFullscreen();
              }}
              title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
            >
              {isFullscreen ? "⤓" : "⤢"}
            </button>
            <button 
              className="ct-stack-cine-player-close"
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
            >
              ×
            </button>
          </div>
        </div>
        
        <div className="ct-stack-cine-player-viewer">
          <div 
            className="ct-stack-cine-player-viewport"
            style={{
              width: '100%',
              height: `${Math.max(400, containerSize.height - 220)}px`, // 220px로 줄여서 이미지 영역을 더 크게
              backgroundColor: '#000',
              position: 'relative',
              border: '2px solid #333',
              borderRadius: '12px',
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff'
            }}
          >
            {isCurrentImageLoaded ? (
              <canvas
                ref={canvasRef}
                style={{
                  maxWidth: '100%',
                  maxHeight: '100%',
                  objectFit: 'contain',
                }}
              />
            ) : (
              <div style={{ textAlign: 'center', padding: '20px' }}>
                <div style={{ 
                  fontSize: '48px', 
                  marginBottom: '20px',
                  background: 'linear-gradient(45deg, #4a9eff, #0078d4)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  fontWeight: 'bold'
                }}>
                  {imageNumber}
                </div>
                
                <div style={{ fontSize: '18px', marginBottom: '10px', color: '#e0e0e0' }}>
                  {isCurrentImageLoading ? `Loading... ${imageNumber} / ${totalImages}` : `Image ${imageNumber} / ${totalImages}`}
                </div>
                
                <div style={{ 
                  fontSize: '12px', 
                  color: '#888', 
                  fontFamily: 'monospace',
                  marginBottom: '15px',
                  wordBreak: 'break-all',
                  maxWidth: '300px'
                }}>
                  {currentImageId ? `${currentImageId.substring(0, 60)}${currentImageId.length > 60 ? '...' : ''}` : 'N/A'}
                </div>
                
                <div style={{ 
                  display: 'flex', 
                  gap: '20px', 
                  justifyContent: 'center',
                  fontSize: '14px',
                  color: '#bbb'
                }}>
                  <span>Modality: {displaySet.Modality || 'N/A'}</span>
                  <span>Series: #{displaySet.SeriesNumber || 'N/A'}</span>
                </div>
                
                {(isPlaying || isCurrentImageLoading) && (
                  <div style={{ 
                    marginTop: '15px',
                    fontSize: '12px',
                    color: '#4a9eff',
                    animation: 'pulse 1s infinite'
                  }}>
                    {isCurrentImageLoading ? 'Loading image...' : `Playing... (${frameRate} fps)`}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        
        <div className="ct-stack-cine-player-controls">
          <div className="ct-stack-cine-player-info">
            <span>Frame Rate: {frameRate} fps</span>
            <span>{isPlaying ? 'Playing' : 'Paused'}</span>
            <span>Loaded: {loadedImages.size}/{totalImages}</span>
          </div>
          
          <div className="ct-stack-cine-player-frame-rate">
            <label>Speed: </label>
            <input
              type="range"
              min="1"
              max="30"
              value={frameRate}
              onChange={(e) => setFrameRate(parseInt(e.target.value))}
              onClick={(e) => e.stopPropagation()}
            />
            <span>{frameRate} fps</span>
          </div>
          
          <div className="ct-stack-cine-player-progress">
            <div className="ct-stack-cine-player-progress-bar">
              <div 
                className="ct-stack-cine-player-progress-fill"
                style={{ width: `${(imageNumber / totalImages) * 100}%` }}
              />
            </div>
            <span>{imageNumber} / {totalImages}</span>
          </div>
          
          <div className="ct-stack-cine-player-image-info">
            <span>Patient ID: {(displaySet as any).PatientID || 'N/A'}</span>
            <span>Study Date: {(displaySet as any).StudyDate || 'N/A'}</span>
            <span>Status: {isCurrentImageLoaded ? 'Rendering Complete' : isCurrentImageLoading ? 'Loading...' : 'Waiting'}</span>
          </div>
        </div>
        
        <div className="ct-stack-cine-player-instructions">
          <span>Click to Play/Pause • Click Outside to Close • Real-time DICOM Image Rendering</span>
        </div>
      </div>
    </div>
  );
};

export default CTStackCinePlayer; 