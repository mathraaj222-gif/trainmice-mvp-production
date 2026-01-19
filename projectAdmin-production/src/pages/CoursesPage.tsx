import React, { useEffect, useState } from 'react';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { Modal } from '../components/common/Modal';
import { Badge } from '../components/common/Badge';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { CourseForm } from '../components/courses/CourseForm';
import { apiClient } from '../lib/api-client';
import { Course, Trainer } from '../types';
import { formatDate, formatCurrency } from '../utils/helpers';
import { Plus, Edit, Trash2, FileText, CheckCircle, XCircle, Eye } from 'lucide-react';
import { showToast } from '../components/common/Toast';

export const CoursesPage: React.FC = () => {
  const [courses, setCourses] = useState<Course[]>([]);
  const [trainers, setTrainers] = useState<{ [key: string]: Trainer }>({});
  const [courseTrainers, setCourseTrainers] = useState<{ [key: string]: string[] }>({});
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [viewingCourse, setViewingCourse] = useState<Course | null>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'approved' | 'denied'>('pending');
  const [filterWithoutTrainer, setFilterWithoutTrainer] = useState<boolean>(false);

  useEffect(() => {
    fetchData();
  }, [activeTab, filterWithoutTrainer]);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Always fetch ALL courses first, then apply client-side filtering
      const [coursesResponse, trainersResponse] = await Promise.all([
        apiClient.getAdminCourses({}),
        apiClient.getTrainers(),
      ]);

      let coursesData = coursesResponse.courses || [];
      
      // Apply client-side filtering based on active tab
      if (activeTab === 'all') {
        // Show all courses - no status filtering
      } else if (activeTab === 'pending') {
        // Only show PENDING_APPROVAL courses
        coursesData = coursesData.filter((c: Course) => 
          c.status === 'PENDING_APPROVAL'
        );
      } else if (activeTab === 'approved') {
        // Only show APPROVED courses
        coursesData = coursesData.filter((c: Course) => 
          c.status === 'APPROVED'
        );
      } else if (activeTab === 'denied') {
        // Show DENIED courses
        coursesData = coursesData.filter((c: Course) => 
          c.status === 'DENIED'
        );
      }

      // Apply "Without Trainer" filter if enabled
      if (filterWithoutTrainer) {
        coursesData = coursesData.filter((c: Course) => {
          // Check if trainer_id is null
          const hasNoTrainerId = !c.trainer_id;
          const courseAny = c as any;
          // Check if there are no courseTrainers
          const hasNoCourseTrainers = !courseAny.courseTrainers || 
            (Array.isArray(courseAny.courseTrainers) && courseAny.courseTrainers.length === 0);
          // Check if there's no trainer object
          const hasNoTrainer = !courseAny.trainer;
          
          return hasNoTrainerId && hasNoCourseTrainers && hasNoTrainer;
        });
      }

      setCourses(coursesData);

      // Build trainers map
      const trainersMap: { [key: string]: Trainer } = {};
      (trainersResponse.trainers || []).forEach((trainer: Trainer) => {
        trainersMap[trainer.id] = trainer;
      });
      setTrainers(trainersMap);

      // Build course trainers map from all courses (not filtered)
      // This ensures we have trainer info for all courses regardless of filters
      const allCoursesData = coursesResponse.courses || [];
      const courseTrainersMap: { [key: string]: string[] } = {};
      for (const course of allCoursesData) {
        const courseAny = course as any;
        if (courseAny.createdByAdmin && courseAny.courseTrainers) {
          courseTrainersMap[course.id] = (courseAny.courseTrainers as any[]).map((ct: any) => ct.trainerId || ct.trainer?.id || '') || [];
        }
      }
      setCourseTrainers(courseTrainersMap);
    } catch (error: any) {
      console.error('Error fetching data:', error);
      showToast('Failed to load courses', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleAddCourse = async (data: Partial<Course>, trainerIds: string[]) => {
    try {
      const courseData = await apiClient.createAdminCourse(data);

      if (trainerIds.length > 0) {
        for (const trainerId of trainerIds) {
          await apiClient.assignTrainerToCourse(courseData.course.id, trainerId);
        }
      }

      setShowAddModal(false);
      showToast('Course created successfully', 'success');
      fetchData();
    } catch (error: any) {
      console.error('Error adding course:', error);
      showToast(error.message || 'Failed to create course', 'error');
    }
  };

  const handleUpdateCourse = async (data: Partial<Course>, trainerIds: string[]) => {
    if (!editingCourse) return;

    try {
      await apiClient.updateAdminCourse(editingCourse.id, data);

      const editingCourseAny = editingCourse as any;
      if (editingCourseAny.createdByAdmin) {
        // Get current trainers
        const currentCourse = courses.find(c => c.id === editingCourse!.id);
        const currentCourseAny = currentCourse as any;
        const currentTrainerIds = currentCourseAny?.courseTrainers 
          ? (currentCourseAny.courseTrainers as any[]).map((ct: any) => ct.trainerId || ct.trainer?.id || '').filter(Boolean)
          : [];

        // Remove trainers not in new list
        for (const trainerId of currentTrainerIds) {
          if (!trainerIds.includes(trainerId)) {
            await apiClient.removeTrainerFromCourse(editingCourse.id, trainerId);
          }
        }

        // Add new trainers
        for (const trainerId of trainerIds) {
          if (!currentTrainerIds.includes(trainerId)) {
            await apiClient.assignTrainerToCourse(editingCourse.id, trainerId);
          }
        }
      }

      setShowEditModal(false);
      setEditingCourse(null);
      showToast('Course updated successfully', 'success');
      fetchData();
    } catch (error: any) {
      console.error('Error updating course:', error);
      showToast(error.message || 'Failed to update course', 'error');
    }
  };

  const handleDeleteCourse = async (id: string) => {
    if (!confirm('Are you sure you want to delete this course?')) return;

    try {
      await apiClient.deleteAdminCourse(id);
      showToast('Course deleted successfully', 'success');
      fetchData();
    } catch (error: any) {
      console.error('Error deleting course:', error);
      showToast(error.message || 'Failed to delete course', 'error');
    }
  };

  const handleApproveCourse = async (id: string) => {
    try {
      await apiClient.approveCourse(id);
      showToast('Course approved successfully', 'success');
      // Switch to approved tab after approval
      setActiveTab('approved');
      fetchData();
    } catch (error: any) {
      console.error('Error approving course:', error);
      showToast(error.message || 'Failed to approve course', 'error');
    }
  };

  const handleRejectCourse = async (id: string) => {
    const rejectionReason = prompt('Please provide a reason for rejection (optional):');
    
    try {
      await apiClient.rejectCourse(id, rejectionReason || undefined);
      showToast('Course denied successfully', 'success');
      // Switch to denied tab after denial
      setActiveTab('denied');
      fetchData();
    } catch (error: any) {
      console.error('Error denying course:', error);
      showToast(error.message || 'Failed to deny course', 'error');
    }
  };

  const openEditModal = async (course: Course) => {
    try {
      // Fetch full course details with all fields
      const response = await apiClient.getAdminCourse(course.id);
      setEditingCourse(response.course);
      setShowEditModal(true);
    } catch (error: any) {
      console.error('Error fetching course details:', error);
      showToast('Failed to load course details', 'error');
    }
  };

  const openViewModal = async (course: Course) => {
    try {
      const response = await apiClient.getAdminCourse(course.id);
      const courseData = response.course;
      
      // Ensure course materials have full URLs
      if (courseData.courseMaterials && Array.isArray(courseData.courseMaterials)) {
        const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '' : 'http://localhost:3000/api');
        const baseUrl = API_BASE_URL ? API_BASE_URL.replace('/api', '') : ''; // Remove /api to get base server URL
        
        courseData.courseMaterials = courseData.courseMaterials.map((m: any) => ({
          ...m,
          fileUrl: m.fileUrl?.startsWith('http') ? m.fileUrl : `${baseUrl}${m.fileUrl}`,
        }));
      }
      
      setViewingCourse(courseData);
      setShowViewModal(true);
    } catch (error: any) {
      console.error('Error fetching course details:', error);
      showToast('Failed to load course details', 'error');
    }
  };

  const getStatusVariant = (status: string) => {
    switch (status.toLowerCase()) {
      case 'approved': return 'success';
      case 'pending_approval': return 'warning';
      case 'draft': return 'default';
      case 'denied': return 'danger';
      default: return 'default';
    }
  };

  const getTrainerNames = (course: Course) => {
    const courseAny = course as any;
    if (course.trainer_id && trainers[course.trainer_id]) {
      return trainers[course.trainer_id].full_name || 'Unknown Trainer';
    }

    if (courseAny.trainer) {
      return (courseAny.trainer as any).fullName || (courseAny.trainer as any).full_name || 'Unknown Trainer';
    }

    const trainerIdsList = courseTrainers[course.id] || [];
    if (courseAny.courseTrainers && courseAny.courseTrainers.length > 0) {
      return (courseAny.courseTrainers as any[])
        .map((ct: any) => {
          if (ct.trainer) {
            return ct.trainer.fullName || ct.trainer.full_name || 'Unknown';
          }
          return trainers[ct.trainerId]?.full_name || 'Unknown';
        })
        .filter(Boolean)
        .join(', ') || 'No trainers assigned';
    }
    if (trainerIdsList.length === 0) return 'No trainers assigned';

    return trainerIdsList
      .map(id => trainers[id]?.full_name || 'Unknown')
      .join(', ');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Courses</h1>
          <p className="text-gray-600 mt-1">
            {loading ? (
              'Loading...'
            ) : (
              <>
                {courses.length} {filterWithoutTrainer ? 'courses without trainer' : activeTab === 'pending' ? 'pending approval' : activeTab === 'approved' ? 'approved' : activeTab === 'denied' ? 'denied' : 'total'} courses
              </>
            )}
          </p>
        </div>
        <Button onClick={() => setShowAddModal(true)}>
          <Plus size={18} className="mr-2" />
          Create Course
        </Button>
      </div>

      {/* Status Tabs Navigation */}
      <div className="border-b border-gray-200 mb-4">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('all')}
            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'all'
                ? 'border-teal-500 text-teal-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            All Courses
          </button>
          <button
            onClick={() => setActiveTab('pending')}
            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'pending'
                ? 'border-teal-500 text-teal-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Pending Approval
          </button>
          <button
            onClick={() => setActiveTab('approved')}
            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'approved'
                ? 'border-teal-500 text-teal-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Approved
          </button>
          <button
            onClick={() => setActiveTab('denied')}
            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'denied'
                ? 'border-teal-500 text-teal-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Denied
          </button>
        </nav>
      </div>

      {/* Additional Filters */}
      <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
        <div className="flex items-center gap-4">
          <span className="text-sm font-semibold text-gray-700">Filters:</span>
          <label className="flex items-center gap-2 cursor-pointer hover:bg-gray-100 px-3 py-2 rounded transition-colors">
            <input
              type="checkbox"
              checked={filterWithoutTrainer}
              onChange={(e) => setFilterWithoutTrainer(e.target.checked)}
              className="w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500 focus:ring-2"
            />
            <span className="text-sm font-medium text-gray-700">Without Trainer</span>
          </label>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {courses.length === 0 ? (
          <div className="col-span-2 text-center py-12 text-gray-500">
            No courses found
          </div>
        ) : (
          courses.map((course) => (
            <Card key={course.id} className="hover:shadow-lg transition-shadow">
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="text-xl font-semibold text-gray-800 mb-2">
                      {course.title}
                    </h3>
                    <div className="flex flex-wrap gap-2 mb-3">
                      <Badge variant={getStatusVariant(course.status)}>
                        {course.status.replace('_', ' ')}
                      </Badge>
                      {course.hrdc_claimable && (
                        <Badge variant="info">HRDC Claimable</Badge>
                      )}
                      {course.created_by_admin && (
                        <Badge variant="warning">Admin Created</Badge>
                      )}
                    </div>
                  </div>
                </div>

                {course.description && (
                  <p className="text-gray-600 text-sm mb-4 line-clamp-2">
                    {course.description}
                  </p>
                )}

                <div className="space-y-2 text-sm text-gray-600 mb-4">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Trainer(s):</span>
                    <span>{getTrainerNames(course)}</span>
                  </div>
                  {course.venue && (
                    <div className="flex items-center justify-between">
                      <span className="font-medium">Venue:</span>
                      <span>{course.venue}</span>
                    </div>
                  )}
                  {course.price && (
                    <div className="flex items-center justify-between">
                      <span className="font-medium">Price:</span>
                      <span className="text-teal-600 font-semibold">
                        {formatCurrency(course.price)}
                      </span>
                    </div>
                  )}
                  {course.duration_hours && (
                    <div className="flex items-center justify-between">
                      <span className="font-medium">Duration:</span>
                      <span>{course.duration_hours} hours</span>
                    </div>
                  )}
                  {course.start_date && (
                    <div className="flex items-center justify-between">
                      <span className="font-medium">Start Date:</span>
                      <span>{formatDate(course.start_date)}</span>
                    </div>
                  )}
                  {course.end_date && (
                    <div className="flex items-center justify-between">
                      <span className="font-medium">End Date:</span>
                      <span>{formatDate(course.end_date)}</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between pt-4 border-t">
                  <div className="flex items-center space-x-3">
                    {course.brochure_url && (
                      <a
                        href={course.brochure_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-teal-600 hover:text-teal-700 flex items-center text-sm"
                      >
                        <FileText size={16} className="mr-1" />
                        View Brochure
                      </a>
                    )}
                    {/* Show approve/reject buttons based on course status (works in all tabs) */}
                    {course.status === 'PENDING_APPROVAL' && (
                      <div className="flex items-center space-x-2">
                        <Button
                          size="sm"
                          variant="success"
                          onClick={() => handleApproveCourse(course.id)}
                          className="flex items-center space-x-1"
                        >
                          <CheckCircle size={16} />
                          <span>Approve</span>
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => handleRejectCourse(course.id)}
                          className="flex items-center space-x-1"
                        >
                          <XCircle size={16} />
                          <span>Deny</span>
                        </Button>
                      </div>
                    )}
                    {course.status === 'APPROVED' && (
                      <div className="flex items-center space-x-2">
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => handleRejectCourse(course.id)}
                          className="flex items-center space-x-1"
                        >
                          <XCircle size={16} />
                          <span>Deny</span>
                        </Button>
                      </div>
                    )}
                    {course.status === 'DRAFT' && !course.created_by_admin && (
                      <div className="flex items-center space-x-2">
                        <Button
                          size="sm"
                          variant="success"
                          onClick={() => handleApproveCourse(course.id)}
                          className="flex items-center space-x-1"
                        >
                          <CheckCircle size={16} />
                          <span>Approve</span>
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="flex space-x-2 ml-auto">
                    <button
                      onClick={() => openViewModal(course)}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                      title="View Details"
                    >
                      <Eye size={18} />
                    </button>
                    <button
                      onClick={() => openEditModal(course)}
                      className="p-2 text-teal-600 hover:bg-teal-50 rounded transition-colors"
                      title="Edit"
                    >
                      <Edit size={18} />
                    </button>
                    <button
                      onClick={() => handleDeleteCourse(course.id)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded transition-colors"
                      title="Delete"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>

      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Create New Course"
        size="lg"
      >
        <CourseForm
          onSubmit={handleAddCourse}
          onCancel={() => setShowAddModal(false)}
        />
      </Modal>

      <Modal
        isOpen={showEditModal}
        onClose={() => {
          setShowEditModal(false);
          setEditingCourse(null);
        }}
        title="Edit Course"
        size="xl"
      >
        {editingCourse && (
          <CourseForm
            course={editingCourse}
            onSubmit={handleUpdateCourse}
            onCancel={() => {
              setShowEditModal(false);
              setEditingCourse(null);
            }}
          />
        )}
      </Modal>

      <Modal
        isOpen={showViewModal}
        onClose={() => {
          setShowViewModal(false);
          setViewingCourse(null);
        }}
        title="Course Details"
        size="lg"
      >
        {viewingCourse && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700">Title</label>
                <p className="mt-1 text-gray-900">{viewingCourse.title}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Status</label>
                <p className="mt-1">
                  <Badge variant={getStatusVariant(viewingCourse.status)}>
                    {viewingCourse.status.replace('_', ' ')}
                  </Badge>
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Course Type</label>
                <p className="mt-1 text-gray-900">{(viewingCourse as any).courseType || 'N/A'}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Course Mode</label>
                <p className="mt-1 text-gray-900">{(viewingCourse as any).courseMode || 'N/A'}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Duration</label>
                <p className="mt-1 text-gray-900">
                  {viewingCourse.duration_hours} {(viewingCourse as any).durationUnit || 'hours'}
                </p>
              </div>
              {viewingCourse.price && (
                <div>
                  <label className="text-sm font-medium text-gray-700">Price</label>
                  <p className="mt-1 text-gray-900">{formatCurrency(viewingCourse.price)}</p>
                </div>
              )}
            </div>
            {viewingCourse.description && (
              <div>
                <label className="text-sm font-medium text-gray-700">Description</label>
                <p className="mt-1 text-gray-900 whitespace-pre-wrap">{viewingCourse.description}</p>
              </div>
            )}
            
            {/* Course Materials Section */}
            {(viewingCourse as any).courseMaterials && Array.isArray((viewingCourse as any).courseMaterials) && (viewingCourse as any).courseMaterials.length > 0 && (
              <div className="pt-4 border-t">
                <label className="text-sm font-medium text-gray-700 mb-3 block">Course Materials</label>
                <div className="space-y-2">
                  {((viewingCourse as any).courseMaterials as any[]).map((material: any) => (
                    <div
                      key={material.id}
                      className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50"
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                          <FileText className="w-5 h-5 text-blue-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {material.fileName}
                          </p>
                          <p className="text-xs text-gray-500">
                            {material.uploadedAt ? new Date(material.uploadedAt).toLocaleDateString() : 'N/A'}
                          </p>
                        </div>
                      </div>
                      <a
                        href={material.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:text-blue-700 px-3 py-1 font-medium"
                      >
                        View
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            <div className="flex space-x-4 pt-4 border-t">
              <Button
                onClick={() => {
                  setShowViewModal(false);
                  if (viewingCourse) {
                    openEditModal(viewingCourse);
                  }
                }}
              >
                <Edit size={18} className="mr-2" />
                Edit Course
              </Button>
              {/* Show approve/reject buttons in view modal based on course status */}
              {viewingCourse.status === 'PENDING_APPROVAL' && (
                <>
                  <Button
                    variant="success"
                    onClick={() => {
                      setShowViewModal(false);
                      if (viewingCourse) {
                        handleApproveCourse(viewingCourse.id);
                      }
                    }}
                  >
                    <CheckCircle size={18} className="mr-2" />
                    Approve
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => {
                      setShowViewModal(false);
                      if (viewingCourse) {
                        handleRejectCourse(viewingCourse.id);
                      }
                    }}
                  >
                    <XCircle size={18} className="mr-2" />
                    Reject
                  </Button>
                </>
              )}
              {viewingCourse.status === 'APPROVED' && (
                <Button
                  variant="danger"
                  onClick={() => {
                    setShowViewModal(false);
                    if (viewingCourse) {
                      handleRejectCourse(viewingCourse.id);
                    }
                  }}
                >
                  <XCircle size={18} className="mr-2" />
                  Reject
                </Button>
              )}
              {viewingCourse.status === 'DRAFT' && (
                <Button
                  variant="success"
                  onClick={() => {
                    setShowViewModal(false);
                    if (viewingCourse) {
                      handleApproveCourse(viewingCourse.id);
                    }
                  }}
                >
                  <CheckCircle size={18} className="mr-2" />
                  Approve
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
