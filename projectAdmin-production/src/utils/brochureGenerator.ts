/**
 * Brochure Generator for Courses
 * Generates a multi-page PDF brochure for courses
 */

import jsPDF from 'jspdf';

interface CourseData {
  title: string;
  courseType?: string;
  startDate?: string | null;
  endDate?: string | null;
  venue?: string | null;
  description?: string | null;
  learningObjectives?: string[] | null;
  learningOutcomes?: string[] | null;
  targetAudience?: string | null;
  methodology?: string | null;
  hrdcClaimable?: boolean;
  schedule?: Array<{
    dayNumber: number;
    startTime: string;
    endTime: string;
    moduleTitle: string;
    submoduleTitle?: string | null;
  }>;
}

export const generateCourseBrochure = async (course: CourseData) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const contentWidth = pageWidth - (2 * margin);
  const maxY = pageHeight - margin;

  // Cache for the second page background image
  let secondPageBgImage: string | null = null;
  let secondPageBgLoaded = false;

  // Helper function to load second page background image
  const loadSecondPageBackground = async (): Promise<string | null> => {
    if (secondPageBgLoaded) {
      return secondPageBgImage;
    }

    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0);
            const imgData = canvas.toDataURL('image/jpeg');
            secondPageBgImage = imgData;
            secondPageBgLoaded = true;
            resolve(imgData);
          } else {
            resolve(null);
          }
        } catch (error) {
          console.error('Error processing second page background:', error);
          resolve(null);
        }
      };
      
      img.onerror = () => {
        console.error('Error loading second page background image');
        secondPageBgLoaded = true; // Mark as loaded to prevent retries
        resolve(null);
      };
      
      img.src = '/Brochure2ndpage.jpeg';
    });
  };

  // Helper function to apply second page background to a new page
  const applySecondPageBackground = async () => {
    const bgImage = await loadSecondPageBackground();
    if (bgImage) {
      doc.addImage(bgImage, 'JPEG', 0, 0, pageWidth, pageHeight);
    } else {
      doc.setFillColor(255, 255, 255);
      doc.rect(0, 0, pageWidth, pageHeight, 'F');
    }
  };

  // Helper function to check if we need a new page
  const checkPageBreak = async (currentY: number, spaceNeeded: number = 20): Promise<number> => {
    if (currentY + spaceNeeded > maxY) {
      doc.addPage();
      await applySecondPageBackground();
      return margin;
    }
    return currentY;
  };

  // Helper function to add text with word wrap and page breaks
  const addText = async (
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    fontSize: number = 10,
    fontStyle: string = 'normal',
    lineHeight: number = 1.5
  ): Promise<number> => {
    doc.setFontSize(fontSize);
    doc.setFont('helvetica', fontStyle);
    const lines = doc.splitTextToSize(text, maxWidth);
    const lineSpacing = fontSize * 0.35 * lineHeight;
    
    let currentY = y;
    for (let i = 0; i < lines.length; i++) {
      currentY = await checkPageBreak(currentY, lineSpacing);
      doc.text(lines[i], x, currentY);
      currentY += lineSpacing;
    }
    
    return currentY;
  };

  // ============================================================================
  // PAGE 1: COVER PAGE WITH BACKGROUND IMAGE
  // ============================================================================
  
  // Load and add background image
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    await new Promise((resolve) => {
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0);
            const imgData = canvas.toDataURL('image/jpeg');
            doc.addImage(imgData, 'JPEG', 0, 0, pageWidth, pageHeight);
            resolve(true);
          } else {
            throw new Error('Could not get canvas context');
          }
        } catch (error) {
          console.error('Error adding image to PDF:', error);
          doc.setFillColor(230, 240, 255);
          doc.rect(0, 0, pageWidth, pageHeight, 'F');
          resolve(false);
        }
      };
      img.onerror = () => {
        console.error('Error loading image');
        doc.setFillColor(230, 240, 255);
        doc.rect(0, 0, pageWidth, pageHeight, 'F');
        resolve(false);
      };
      img.src = '/BrochureFrontPage.jpeg';
    });
  } catch (error) {
    console.error('Error loading background image:', error);
    doc.setFillColor(230, 240, 255);
    doc.rect(0, 0, pageWidth, pageHeight, 'F');
  }

  // Calculate date text
  let dateText = 'TBA';
  if (course.startDate) {
    const startDate = new Date(course.startDate);
    if (course.endDate && course.endDate !== course.startDate) {
      const endDate = new Date(course.endDate);
      dateText = `${startDate.toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })} - ${endDate.toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })}`;
    } else {
      dateText = startDate.toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' });
    }
  }

  // Course type mapping
  const courseTypeMap: { [key: string]: string } = {
    'IN_HOUSE': 'In-House',
    'PUBLIC': 'Public',
    'VIRTUAL': 'Virtual',
  };

  // Course title - lowered position
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(28);
  doc.setFont('helvetica', 'bold');
  const titleMaxWidth = contentWidth;
  const titleLines = doc.splitTextToSize(course.title, titleMaxWidth);
  const titleY = 80; // Lowered from 50 to 80
  
  // Center or left-align title
  titleLines.forEach((line: string, index: number) => {
    doc.text(line, margin, titleY + (index * 10));
  });

  // Course details below title
  let yPos = titleY + (titleLines.length * 10) + 25;
  doc.setFontSize(13);
  doc.setFont('helvetica', 'normal');

  // Training Mode
  doc.setFont('helvetica', 'bold');
  doc.text('Training Mode: ', margin, yPos);
  doc.setFont('helvetica', 'normal');
  const modeText = courseTypeMap[course.courseType || 'IN_HOUSE'] || course.courseType || 'In-House';
  doc.text(modeText, margin + 50, yPos);
  yPos += 12;

  // Date - on front page
  doc.setFont('helvetica', 'bold');
  doc.text('Date: ', margin, yPos);
  doc.setFont('helvetica', 'normal');
  const dateLines = doc.splitTextToSize(dateText, contentWidth - 50);
  dateLines.forEach((line: string, index: number) => {
    doc.text(line, margin + 50, yPos + (index * 6));
  });
  yPos += Math.max(dateLines.length * 6, 12);

  // Venue - on front page
  doc.setFont('helvetica', 'bold');
  doc.text('Venue: ', margin, yPos);
  doc.setFont('helvetica', 'normal');
  const venueText = course.venue || 'TBA';
  const venueLines = doc.splitTextToSize(venueText, contentWidth - 50);
  venueLines.forEach((line: string, index: number) => {
    doc.text(line, margin + 50, yPos + (index * 6));
  });

  // Footer contact info
  doc.setFillColor(0, 51, 102, 0.9);
  doc.rect(0, pageHeight - 20, pageWidth, 20, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Phone: +6019 9331 008', margin, pageHeight - 12);
  doc.text('Email: enquiry@trainmice.com', pageWidth / 2 - 30, pageHeight - 12);
  doc.text('Website: www.trainmice.com', pageWidth - 70, pageHeight - 12);

  // ============================================================================
  // PAGE 2: COURSE DETAILS WITH BACKGROUND IMAGE
  // ============================================================================
  doc.addPage();
  await applySecondPageBackground();

  let currentY = margin;

  // Header
  doc.setTextColor(0, 51, 102);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('COURSE INFORMATION', pageWidth / 2, currentY, { align: 'center' });
  currentY += 15;

  // Course details without table
  doc.setTextColor(0, 0, 0);
  
  // Topic
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('TOPIC:', margin, currentY);
  currentY += 7;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  currentY = await addText(course.title, margin, currentY, contentWidth, 10);
  currentY += 8;

  // Date
  currentY = await checkPageBreak(currentY, 15);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('DATE:', margin, currentY);
  currentY += 7;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  currentY = await addText(dateText, margin, currentY, contentWidth, 10);
  currentY += 8;

  // Venue
  currentY = await checkPageBreak(currentY, 15);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('VENUE:', margin, currentY);
  currentY += 7;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  currentY = await addText(course.venue || 'TBA', margin, currentY, contentWidth, 10);
  currentY += 8;

  // Certificate (only if HRDC claimable)
  if (course.hrdcClaimable) {
    currentY = await checkPageBreak(currentY, 15);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('CERTIFICATE:', margin, currentY);
    currentY += 7;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    currentY = await addText('CERTIFICATE OF ATTENDANCE', margin, currentY, contentWidth, 10);
    currentY += 8;
  }

  currentY += 5;

  // Introduction
  currentY = await checkPageBreak(currentY, 20);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Introduction:', margin, currentY);
  currentY += 7;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  if (course.description) {
    currentY = await addText(course.description, margin, currentY, contentWidth, 10);
  } else {
    doc.text('N/A', margin, currentY);
    currentY += 6;
  }
  currentY += 10;

  // Course Objectives
  currentY = await checkPageBreak(currentY, 20);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Course Objectives:', margin, currentY);
  currentY += 7;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  if (course.learningObjectives && course.learningObjectives.length > 0) {
    for (const obj of course.learningObjectives) {
      currentY = await checkPageBreak(currentY, 15);
      const bulletText = `• ${obj}`;
      currentY = await addText(bulletText, margin + 2, currentY, contentWidth - 2, 10);
      currentY += 2;
    }
  } else {
    doc.text('N/A', margin + 5, currentY);
    currentY += 6;
  }
  currentY += 10;

  // Learning Outcomes
  currentY = await checkPageBreak(currentY, 20);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Learning Outcomes:', margin, currentY);
  currentY += 7;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  if (course.learningOutcomes && course.learningOutcomes.length > 0) {
    for (const outcome of course.learningOutcomes) {
      currentY = await checkPageBreak(currentY, 15);
      const bulletText = `• ${outcome}`;
      currentY = await addText(bulletText, margin + 2, currentY, contentWidth - 2, 10);
      currentY += 2;
    }
  } else {
    doc.text('N/A', margin + 5, currentY);
    currentY += 6;
  }
  currentY += 10;

  // Target Audience
  currentY = await checkPageBreak(currentY, 20);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Target Audience:', margin, currentY);
  currentY += 7;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  if (course.targetAudience) {
    currentY = await addText(course.targetAudience, margin, currentY, contentWidth, 10);
  } else {
    doc.text('N/A', margin, currentY);
    currentY += 6;
  }
  currentY += 10;

  // Methodology
  currentY = await checkPageBreak(currentY, 20);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Methodology:', margin, currentY);
  currentY += 7;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  if (course.methodology) {
    currentY = await addText(course.methodology, margin, currentY, contentWidth, 10);
  } else {
    doc.text('N/A', margin, currentY);
    currentY += 6;
  }

  // ============================================================================
  // COURSE SCHEDULE (with automatic page breaks, no table)
  // ============================================================================
  doc.addPage();
  await applySecondPageBackground();

  currentY = margin;

  // Header
  doc.setTextColor(0, 51, 102);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('COURSE SCHEDULE', pageWidth / 2, currentY, { align: 'center' });
  currentY += 15;

  doc.setTextColor(0, 0, 0);

  if (course.schedule && course.schedule.length > 0) {
    // Group schedule by day
    const scheduleByDay: { [day: number]: typeof course.schedule } = {};
    course.schedule.forEach(item => {
      if (!scheduleByDay[item.dayNumber]) {
        scheduleByDay[item.dayNumber] = [];
      }
      scheduleByDay[item.dayNumber].push(item);
    });

    // Display schedule by day
    const sortedDays = Object.keys(scheduleByDay).sort((a, b) => parseInt(a) - parseInt(b));
    for (const day of sortedDays) {
      const dayItems = scheduleByDay[parseInt(day)];
      
      // Day header
      currentY = await checkPageBreak(currentY, 30);
      doc.setFillColor(0, 51, 102);
      doc.roundedRect(margin, currentY, contentWidth, 8, 2, 2, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text(`Day ${day}`, margin + 5, currentY + 6);
      currentY += 12;
      doc.setTextColor(0, 0, 0);

      // Schedule items for this day
      for (const item of dayItems) {
        // Check if we need space for this item
        currentY = await checkPageBreak(currentY, 25);

        // Time
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text(`${item.startTime} - ${item.endTime}`, margin, currentY);
        currentY += 6;

        // Module title
        doc.setFont('helvetica', 'bold');
        currentY = await addText(item.moduleTitle, margin + 5, currentY, contentWidth - 5, 10, 'bold');

        // Submodule title (if exists)
        if (item.submoduleTitle) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(9);
          currentY = await addText(item.submoduleTitle, margin + 5, currentY, contentWidth - 5, 9);
        }

        currentY += 8;
      }

      currentY += 5;
    }
  } else {
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text('Schedule to be announced', pageWidth / 2, currentY + 20, { align: 'center' });
  }

  // Save the PDF
  const fileName = `${course.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_brochure.pdf`;
  doc.save(fileName);
};